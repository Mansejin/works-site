#!/usr/bin/env python3
"""Apply Cloudflare Access + DNS proxy for the works subdomain.

Path split (personal vs company):
  - Catch-all works host     → OWNER emails only (/, /project, …)
  - /dddit* /logitechG*      → COMPANY emails (includes owners)
  - Brand plan/conti/productlist + /dddit/js* + /css* → Bypass (public)

Requires env:
  CF_API_TOKEN
Optional:
  CF_ACCOUNT_ID / CF_ZONE_ID
  WORKS_ACCESS_OWNER_EMAILS   — personal root allowlist
  WORKS_ACCESS_COMPANY_EMAILS — company path allowlist (should include owners)
  WORKS_ACCESS_ALLOW_EMAILS   — legacy alias merged into company list
  DRY_RUN=1
  CF_DELETE_LOGITECH_BYPASS=1

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
HOSTNAME = "works." + "mansejin.com"
ORIGIN_CNAME = "mansejin.github.io"
PERSONAL_APP_NAME = "works"
COMPANY_APPS = (
    ("works-dddit", "/dddit*"),
    ("works-logitechg", "/logitechG*"),
)
PUBLIC_BRANDS = ("xenics", "vendict", "inic", "galaxy")
BYPASS_PATHS: list[str] = [
    "/dddit/js*",
    "/css*",
    # /project hub stays Access-protected (catch-all); children use team passcode only
    "/project/*",
]
for _brand in PUBLIC_BRANDS:
    BYPASS_PATHS.extend(
        [
            f"/dddit/{_brand}/plan*",
            f"/dddit/{_brand}/conti*",
            f"/dddit/{_brand}/productlist*",
        ]
    )

DEFAULT_OWNER_EMAILS = (
    "adoholabusiness@gmail.com",
    "Sae3648@gmail.com",
)
DEFAULT_COMPANY_EXTRA = (
    "peppe841107@gmail.com",
    "ddditchannel@gmail.com",
    "jskim@ohola.co.kr",
    "sjoh@ohola.co.kr",
    "smpark@ohola.co.kr",
)


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


def bypass_app_name(path: str) -> str:
    clean = path.strip("/").replace("*", "").replace("/", "-")
    return f"works-bypass-{clean or 'root'}"[:60]


def parse_emails(*raw_lists: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in raw_lists:
        for part in (raw or "").split(","):
            email = part.strip()
            if not email:
                continue
            key = email.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(email)
    return out


def allow_include(emails: list[str]) -> list[dict]:
    if not emails:
        return [{"everyone": {}}]
    return [{"email": {"email": e}} for e in emails]


def upsert_app(
    token: str,
    account_id: str,
    by_domain: dict,
    apps: list,
    *,
    name: str,
    domain: str,
    policy_name: str,
    emails: list[str],
    dry: bool,
) -> None:
    existing = by_domain.get(domain)
    for a in apps:
        if a.get("name") == name:
            existing = a
            break
    body = {
        "name": name,
        "domain": domain,
        "type": "self_hosted",
        "session_duration": "24h",
        "auto_redirect_to_identity": False,
        "app_launcher_visible": True,
        # Allow JS to read CF_Authorization for Access→team-token exchange
        "http_only_cookie_attribute": False,
        "same_site_cookie_attribute": "lax",
        "policies": [
            {
                "name": policy_name,
                "decision": "allow",
                "include": allow_include(emails),
            }
        ],
    }
    who = "emails:" + ",".join(emails) if emails else "everyone"
    print(f"Access Protect app: {domain} ({'update' if existing else 'create'}; allow={who})")
    if dry:
        return
    if existing:
        api(token, "PUT", f"/accounts/{account_id}/access/apps/{existing['id']}", body)
    else:
        api(token, "POST", f"/accounts/{account_id}/access/apps", body)


def main() -> None:
    token = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        die("CF_API_TOKEN missing.")

    dry = os.environ.get("DRY_RUN", "").strip() in {"1", "true", "yes"}
    account_id = os.environ.get("CF_ACCOUNT_ID")
    zone_id = os.environ.get("CF_ZONE_ID")

    owner_emails = parse_emails(os.environ.get("WORKS_ACCESS_OWNER_EMAILS", ""))
    if not owner_emails:
        owner_emails = list(DEFAULT_OWNER_EMAILS)

    company_emails = parse_emails(
        os.environ.get("WORKS_ACCESS_COMPANY_EMAILS", ""),
        os.environ.get("WORKS_ACCESS_ALLOW_EMAILS", ""),
    )
    if not company_emails:
        company_emails = parse_emails(
            ",".join(DEFAULT_OWNER_EMAILS),
            ",".join(DEFAULT_COMPANY_EXTRA),
        )
    # Owners must reach company paths too
    company_emails = parse_emails(",".join(company_emails), ",".join(owner_emails))

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
                print(
                    f"account_id={account_id} "
                    f"(from zone; {(zone.get('account') or {}).get('name')})"
                )

    if not account_id:
        accounts = api(token, "GET", "/accounts?per_page=50")["result"]
        if not accounts:
            die("No Cloudflare account_id — set CF_ACCOUNT_ID")
        account_id = accounts[0]["id"]
        print(f"account_id={account_id} ({accounts[0].get('name')})")
    elif os.environ.get("CF_ACCOUNT_ID"):
        print(f"account_id={account_id} (from CF_ACCOUNT_ID)")

    if os.environ.get("CF_ZONE_ID"):
        print(f"zone_id={zone_id} (from CF_ZONE_ID)")

    print(f"owner_emails={','.join(owner_emails)}")
    print(f"company_emails={','.join(company_emails)}")

    # --- DNS ---
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

    # --- SSL ---
    try:
        ssl = api(token, "GET", f"/zones/{zone_id}/settings/ssl")["result"]
        print(f"SSL mode={ssl.get('value')} (want full or strict)")
        if not dry and ssl.get("value") not in {"full", "strict"}:
            api(token, "PATCH", f"/zones/{zone_id}/settings/ssl", {"value": "full"})
            print("SSL set to full")
    except CloudflareApiError as e:
        print(f"WARN: SSL settings skipped ({e})", file=sys.stderr)

    # --- Access apps ---
    apps = api(token, "GET", f"/accounts/{account_id}/access/apps")["result"]
    by_domain = {a.get("domain"): a for a in apps if a.get("domain")}
    desired_bypass = {f"{HOSTNAME}{p}" for p in BYPASS_PATHS}
    desired_company = {f"{HOSTNAME}{p}" for _, p in COMPANY_APPS}
    desired_all = desired_bypass | desired_company | {HOSTNAME}

    for a in apps:
        domain = a.get("domain") or ""
        name = (a.get("name") or "").lower()
        if domain in desired_all:
            continue
        if name in {PERSONAL_APP_NAME, "works-mansejin"} and domain == HOSTNAME:
            continue
        obsolete = False
        if name.startswith("works-bypass-") and domain not in desired_bypass:
            obsolete = True
        if name.startswith("works-") and domain not in desired_all and domain.startswith(HOSTNAME):
            # old company/protect variants
            if domain != HOSTNAME:
                obsolete = True
        if "logitech" in name and "bypass" in name:
            print(f"Legacy logitech Bypass: {a.get('name')} ({domain})")
            if not dry and os.environ.get("CF_DELETE_LOGITECH_BYPASS", "") in {
                "1",
                "true",
                "yes",
            }:
                api(token, "DELETE", f"/accounts/{account_id}/access/apps/{a['id']}")
                print("  deleted")
            continue
        if obsolete:
            print(f"Obsolete Access app: {a.get('name')} ({domain}) → delete")
            if not dry:
                api(token, "DELETE", f"/accounts/{account_id}/access/apps/{a['id']}")
                print("  deleted")

    if not dry:
        apps = api(token, "GET", f"/accounts/{account_id}/access/apps")["result"]
        by_domain = {a.get("domain"): a for a in apps if a.get("domain")}

    # Bypass first (most specific public shares)
    for path in BYPASS_PATHS:
        domain = f"{HOSTNAME}{path}"
        existing = by_domain.get(domain)
        body = {
            "name": bypass_app_name(path),
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

    # Company paths (more specific than catch-all)
    for name, path in COMPANY_APPS:
        upsert_app(
            token,
            account_id,
            by_domain,
            apps,
            name=name,
            domain=f"{HOSTNAME}{path}",
            policy_name="company-team",
            emails=company_emails,
            dry=dry,
        )

    # Personal catch-all last conceptually (least specific domain)
    upsert_app(
        token,
        account_id,
        by_domain,
        apps,
        name=PERSONAL_APP_NAME,
        domain=HOSTNAME,
        policy_name="personal-only",
        emails=owner_emails,
        dry=dry,
    )

    print("Done." if not dry else "Dry-run complete (no writes).")
    print("Expect:")
    print(f"  /                 → owner only ({', '.join(owner_emails)})")
    print(f"  /dddit /logitechG → company ({', '.join(company_emails)})")
    print("  /dddit/*/productlist|plan|conti → public Bypass")


if __name__ == "__main__":
    try:
        main()
    except CloudflareApiError as e:
        die(str(e))
