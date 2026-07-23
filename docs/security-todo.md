# Security hardening backlog — works.<domain>

Last audit: 2026-07-23 (Cloud Agent).  
Live Access + API fixes from that pass are tracked below.

## Done (this deploy)

- [x] Cloudflare Access Protect on `/` + internal paths; Proxied DNS
- [x] Narrow Access Bypass to brand `plan|conti|productlist` (+ brand home)
- [x] Bypass `/dddit/js*` + `/css*` so public brand pages can load shared assets
- [x] Protect `/api/logitechg/*` with team token (schedule write/read)
- [x] Productlist PUT: allowlist brands only + works Origin + rate limit
- [x] Scope public `sheet/get` / `conti` to public brands; redact spreadsheet IDs
- [x] Studio import: require `DDDIT_STUDIO_IMPORT_SECRET` (Origin alone insufficient)
- [x] Conti WebSocket: require team token query param
- [x] Login rate limit (per IP)
- [x] Team token HMAC full digest (legacy truncated still accepted)
- [x] Remove client `sessionStorage` bypass before status check
- [x] `.gitignore` for `.env` / credentials

## TODO (next)

### High
- [ ] Set `WORKS_ACCESS_ALLOW_EMAILS` (or IdP group) — Access Allow is currently `everyone`
- [ ] Set `DDDIT_TEAM_GATE_SECRET` separate from passcode on NAS
- [ ] Set `DDDIT_STUDIO_IMPORT_SECRET` on NAS + update Studio bookmarklet header
- [ ] Confirm SSL/TLS = Full (or strict) in Cloudflare Dashboard (API token lacked settings)
- [ ] Cloudflare WAF rate rule on `/api/dddit/team-gate/login` (defense beyond in-process)

### Medium
- [ ] Stop committing `api/data/youtube/promotions.json` (move to NAS-only) / scrub history if needed
- [ ] Add SRI or self-host Chart.js / JSZip on report + script pages
- [ ] Disable client-persisted Gemini API key in script machine (NAS proxy only)
- [ ] Move YouTube Innertube default key to env; restrict GCP key
- [ ] PPM edit password: replace client SHA-256 theater or document local-only trust

### Low
- [ ] `noindex` on `docs/google-ads-api-design-sample.html` or exclude from Pages
- [ ] Fail API startup in prod if `WORKS_ALLOWED_ORIGINS` missing works origin
- [ ] Update curl examples in `api/README.md` / sheets docs to include team token
