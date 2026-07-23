#!/usr/bin/env python3
"""Apply Cloudflare Access + DNS proxy for works.mansejin.com.

Requires env:
  CF_API_TOKEN   — token with Account Zero Trust Write, Zone DNS Edit, Zone SSL/TLS Edit
Optional:
  CF_ACCOUNT_ID  — skip account discovery (zone-scoped tokens often cannot list /accounts;
                   script falls back to zone.account.id)
  CF_ZONE_ID     — skip zone discovery
  WORKS_ACCESS_ALLOW_EMAILS — comma-separated emails for Allow policy
                              (default: everyone — tighten after first login works)
  DRY_RUN=1      — print planned changes only
  CF_DELETE_LOGITECH_BYPASS=1 — delete legacy logitech Access apps if found

See scripts/cloudflare-access-checklist.md
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.cloudflare.com/client/v4"
HOSTNAME = "works.mansejin.com"
ORIGIN_CNAME = "mansejin.github.io"
APP_NAME = "works-mansejin"
BYPASS_PATHS = [
    "/dddit/xenics*",
    "/dddit/vendict*",
    "/dddit/inic*",
    "/dddit/galaxy*",
]


class CloudflareApiError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def api(token: str, method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            payload = json.load(res)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise CloudflareApiError(
            f"{method} {path} → HTTP {e.code}: {detail}", status=e.code
        ) from e
    if not payload.get("success", False):
        raise CloudflareApiError(f"{method} {path} failed: {payload.get('errors')}")
    return payload


def main() -> None:
    token = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        die(
            "CF_API_TOKEN missing. Add a Cloudflare API token secret to this Cloud Agent "
            "(or run locally), then re-run. MCP OAuth is not available in this environment."
        )

    dry = os.environ.get("DRY_RUN", "").strip() in {"1", "true", "yes"}
    account_id = os.environ.get("CF_ACCOUNT_ID")
    zone_id = os.environ.get("CF_ZONE_ID")
    allow_emails = [
        e.strip()
        for e in os.environ.get("WORKS_ACCESS_ALLOW_EMAILS", "").split(",")
        if e.strip()
    ]

    if not zone_id:
        zones = api(token, "GET", "/zones?name=mansejin.com")["result"]
        if not zones:
            die("Zone mansejin.com not found")
        zone = zones[0]
        zone_id = zone["id"]
        print(f"zone_id={zone_id}")
        if not account_id:
            account_id = (zone.get("account") or {}).get("id")
            if account_id:
                acct_name = (zone.get("account") or {}).get("name")
                print(f"account_id={account_id} (from zone; {acct_name})")

    if not account_id:
        accounts = api(token, "GET", "/accounts?per_page=50")["result"]
        if not accounts:
            die(
                "No Cloudflare account_id — set CF_ACCOUNT_ID "
                "(zone-scoped tokens often cannot list /accounts)"
            )
        account_id = accounts[0]["id"]
        print(f"account_id={account_id} ({accounts[0].get('name')})")
    elif os.environ.get("CF_ACCOUNT_ID"):
        print(f"account_id={account_id} (from CF_ACCOUNT_ID)")

    if os.environ.get("CF_ZONE_ID"):
        print(f"zone_id={zone_id} (from CF_ZONE_ID)")

    # --- DNS: works CNAME proxied ---
    records = api(
        token,
        "GET",
        f"/zones/{zone_id}/dns_records?type=CNAME&name={urllib.parse.quote(HOSTNAME)}",
    )["result"]
    if not records:
        die(f"CNAME {HOSTNAME} not found — create it first (→ {ORIGIN_CNAME})")
    rec = records[0]
    dns_body = {
        "type": "CNAME",
        "name": "works",
        "content": ORIGIN_CNAME,
        "proxied": True,
        "ttl": 1,
    }
    print(
        f"DNS {HOSTNAME}: proxied={rec.get('proxied')} content={rec.get('content')} "
        f"→ proxied=True content={ORIGIN_CNAME}"
    )
    if not dry and (not rec.get("proxied") or rec.get("content") != ORIGIN_CNAME):
        api(token, "PUT", f"/zones/{zone_id}/dns_records/{rec['id']}", dns_body)
        print("DNS updated (Proxied)")

    # --- SSL Full (zone-settings may be denied on narrow tokens) ---
    try:
        ssl = api(token, "GET", f"/zones/{zone_id}/settings/ssl")["result"]
        print(f"SSL mode={ssl.get('value')} (want full or strict)")
        if not dry and ssl.get("value") not in {"full", "strict"}:
            api(token, "PATCH", f"/zones/{zone_id}/settings/ssl", {"value": "full"})
            print("SSL set to full")
    except CloudflareApiError as e:
        print(
            f"WARN: SSL settings skipped ({e}). Confirm Full/strict in Dashboard "
            "(Zone → SSL/TLS). Continuing with DNS + Access.",
            file=sys.stderr,
        )

    # --- Access apps ---
    apps = api(token, "GET", f"/accounts/{account_id}/access/apps")["result"]
    by_domain = {a.get("domain"): a for a in apps if a.get("domain")}

    # Bypass apps (one per brand prefix) — more specific than catch-all
    for path in BYPASS_PATHS:
        domain = f"{HOSTNAME}{path}"
        name = f"works-bypass-{path.strip('/*').split('/')[-1]}"
        existing = by_domain.get(domain)
        body = {
            "name": name,
            "domain": domain,
            "type": "self_hosted",
            "session_duration": "24h",
            "auto_redirect_to_identity": False,
            "policies": [
                {
                    "name": "public-brand-share",
                    "decision": "bypass",
                    "include": [{"everyone": {}}],
                }
            ],
        }
        print(f"Access Bypass app: {domain} ({'update' if existing else 'create'})")
        if dry:
            continue
        if existing:
            api(token, "PUT", f"/accounts/{account_id}/access/apps/{existing['id']}", body)
        else:
            api(token, "POST", f"/accounts/{account_id}/access/apps", body)

    # Protect catch-all (no logitech Bypass)
    include = (
        [{"email": {"email": e}} for e in allow_emails]
        if allow_emails
        else [{"everyone": {}}]
    )
    protect_body = {
        "name": APP_NAME,
        "domain": HOSTNAME,
        "type": "self_hosted",
        "session_duration": "24h",
        "auto_redirect_to_identity": False,
        "policies": [
            {
                "name": "team-only",
                "decision": "allow",
                "include": include,
            }
        ],
    }
    existing_protect = by_domain.get(HOSTNAME)
    # Prefer app named APP_NAME if domain collision with destinations API variants
    for a in apps:
        if a.get("name") == APP_NAME:
            existing_protect = a
            break
    print(
        f"Access Protect app: {HOSTNAME} "
        f"({'update' if existing_protect else 'create'}; "
        f"allow={'emails:'+','.join(allow_emails) if allow_emails else 'everyone'})"
    )
    if not dry:
        if existing_protect:
            api(
                token,
                "PUT",
                f"/accounts/{account_id}/access/apps/{existing_protect['id']}",
                protect_body,
            )
        else:
            api(token, "POST", f"/accounts/{account_id}/access/apps", protect_body)

    # Remove legacy logitech Bypass if present
    for a in apps:
        domain = (a.get("domain") or "")
        name = (a.get("name") or "").lower()
        if "logitech" in domain.lower() or "logitech" in name:
            print(f"Legacy logitech Access app found: {a.get('name')} ({domain}) id={a.get('id')}")
            print("  → delete manually or set CF_DELETE_LOGITECH_BYPASS=1")
            if not dry and os.environ.get("CF_DELETE_LOGITECH_BYPASS", "") in {"1", "true", "yes"}:
                api(token, "DELETE", f"/accounts/{account_id}/access/apps/{a['id']}")
                print("  deleted")

    print("Done." if not dry else "Dry-run complete (no writes).")
    print(f"Verify: curl -sL https://{HOSTNAME}/ | head")
    print(f"Brand:  curl -sI https://{HOSTNAME}/dddit/xenics/productlist/")


if __name__ == "__main__":
    try:
        main()
    except CloudflareApiError as e:
        die(str(e))
