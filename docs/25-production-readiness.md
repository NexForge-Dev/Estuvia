# 25 — Production readiness (audit of 2026-10-28)

This document describes what the code **actually** does today and what must happen before a commercial launch. It replaces assumptions in older docs where they conflict.

## Runtime reality

| Area | Current implementation | Consequence |
|---|---|---|
| Persistence | One JSON file (`data/db.json`) held in memory and rewritten atomically (temp file + rename) on every write. Radar uses `data/radar.json`. | **Single process, single instance only.** No horizontal scaling, no concurrent writers, whole-file rewrite cost grows with users. Migration path: reimplement `server/store.js` (interface is isolated). |
| Write failures | Since this audit, a failed write rejects the request (HTTP 500) and `/api/health` returns **503** until a write succeeds. | Point external monitoring at `/api/health`. |
| Files | Document wallet: AES-256-GCM at rest in `data/docfiles` (server-held key, **not end-to-end**). Community images in `data/media`. | Back up together with the JSON files and `DOCUMENTS_KEY`. |
| In-memory state | Mentor action proposals (30 min), rate-limit counters, request metrics, recent logs. | Lost on restart; rate limits are per process. |
| Async errors | Express 4 does not catch rejected async handlers; `server/app.js` now forwards them to the error handler, and `server/index.js` logs (instead of crashing on) unhandled rejections. | One bad request no longer takes the server down for everyone. |
| Deployment config | None in the repository (no Dockerfile/Procfile/IaC). | Hosting must be chosen; requirements below. |

## Hosting requirements

- Node ≥ 20 (CI uses 22), one long-running process, persistent writable disk for `data/` (or `DATA_FILE`, `MEDIA_DIR`, `DOCS_DIR`, `RADAR_DATA_FILE`).
- TLS-terminating reverse proxy in front; `NODE_ENV=production` enables `trust proxy`, `Secure` cookies and HSTS. Set `ALLOWED_ORIGIN` to the public origin.
- Outbound HTTPS to: `www.juntadeandalucia.es`, `masteres.ugr.es` (Radar), and optionally the AI provider, Travelpayouts, GDELT, Wikipedia, YouTube Data API, ECB FX.

## Environment variables (production)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | |
| `JWT_SECRET` | yes (≥ 32 chars) | Server refuses to start otherwise. Rotating it logs everyone out. |
| `DOCUMENTS_KEY` | yes (≥ 32 chars) | Server refuses to start otherwise. **Losing it makes every stored document unreadable.** Keep it in a secrets manager with backup. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | recommended | Password ≥ 12 chars with letters and digits in production. The email is reserved (cannot be registered). On each boot the password is re-synced from env and existing sessions of that account are revoked if it changed. Never logged. |
| `ALLOWED_ORIGIN` | yes behind a proxy | CSRF origin check. |
| `MENTOR_PROVIDER`, `MENTOR_MODEL`, `ANTHROPIC_API_KEY` | optional | Without them the Mentor runs in Guided Mode (no generative AI, clearly labeled). |
| `AI_DAILY_TOKENS_PER_USER`, `MENTOR_TIMEOUT_MS`, `MENTOR_DEADLINE_MS` | optional | Cost and latency caps (see docs/15). |
| `TRAVELPAYOUTS_TOKEN`, `YOUTUBE_API_KEY` | optional | Indicative prices / videos. |
| `MODERATOR_EMAILS`, `RADAR_ADMIN_EMAILS` | **ignored in production** | Registration does not verify email, so granting roles by email was a privilege-escalation hole. Grant roles in `#/admin/aluno/:id` → *Papel*. |

## Roles

Roles come only from the server-side `role` field: `admin` (only the `ADMIN_EMAIL` account, set at boot), `moderador`, `radar`. The admin grants/revokes `moderador` and `radar` via `POST /api/admin/users/:id/role`; the change revokes the target's sessions and is audited (`admin-role`).

## Backup and restore

1. Stop the process (or accept a crash-consistent copy: writes are atomic renames).
2. Copy `db.json`, `radar.json`, `docfiles/`, `media/`, `document-rules.json` together. Store `DOCUMENTS_KEY` separately.
3. Restore by putting the files back and starting with the **same** `DOCUMENTS_KEY`.
4. Test a restore before launch. No automated backup exists yet.

## Verified in this audit

- `npm run check` (syntax of all JS) and `npm test`: **235/235** pass (baseline was 171/173; two Radar tests were date-dependent).
- Manual smoke run: production boot refuses missing `DOCUMENTS_KEY`; dev server serves the SPA, registration, journeys, Radar.
- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm run check`, `npm test`, `npm audit --omit=dev --audit-level=high` on PRs. `npm audit` reported 0 vulnerabilities on 2026-10-28.

## Not verified (needs credentials, infrastructure or a human)

- Real AI provider calls (tests use a local fake Anthropic server driving the real SDK).
- Real Travelpayouts, YouTube, GDELT, Wikipedia, ECB calls; live Radar scraping (tests use saved official HTML).
- Browser end-to-end and accessibility testing at mobile/tablet/desktop sizes (no browser test tooling in the repo).
- Any staging or production deployment.

## Blockers before a paid launch

1. **No email verification.** Password reset by email now exists (`POST /api/auth/forgot-password` / `reset-password`, Resend via `RESEND_API_KEY` + `EMAIL_FROM`, 1-hour single-use token stored hashed, resets revoke sessions). Without those variables in production, recovery responds 503. Registration still does not verify the email address.
2. **Single-instance JSON persistence** with no automated backups. Acceptable for a small pilot on one server with disk backups; not for scale.
3. **Legal review (LGPD/GDPR)** — see below.
4. **Official-data status:** IPREM 2026 (€600) still *pending* (matches Ley 31/2022, extended budgets; no 2026-specific norm found in the BOE on 2026-10-28). DUA short link and Salvador consulate contacts verified on 2026-10-28. The local catalog is demonstrative; scholarships show "no confirmed call".
5. **Self-declared official outcomes:** admission/enrollment/visa are student-declared (now recorded with `origem: 'declarado'`, audited, and enrollment/visa require a declared admission first). There is no officially-confirmed state; product decision needed.

## Legal questions for qualified review

- Retention of audit logs (IP, user agent, failed-login emails) after account deletion; Marco Civil art. 15 may require 6 months — define period and legal basis.
- Whether internal admin notes must be included in the data export (currently **excluded**, matching the admin panel's promise).
- Consent text says only the student accesses documents, while the server holds the key (encryption at rest, not end-to-end). Changing it may require bumping `CONSENT_VERSION`.
- Free-text detail of reports by deleted users is kept (author id removed).
- Visa proof-of-funds is shown as an estimate (100% IPREM × months, single applicant); dependents and deductions are not modelled. Never presented as a guarantee.

## Known limitations (accepted for now)

- Logout clears the cookie but does not revoke the JWT server-side (use "Sair de todos os dispositivos" for revocation). Sessions last 8 h.
- Login throttling is per IP (20 / 15 min); there is no per-account lockout.
- Encrypted PDFs cannot be scanned for active content; PDFs are served inline.
- Radar "Candidaturas abertas" alerts can fire while the source is stale (the card itself shows *desatualizado*).
- Mentor proposals are lost on restart; partial execution of a multi-step proposal is reported as "not executed" in the UI.
- A monthly budget item marked "pago" counts as paid for the whole stay; a granted scholarship also added as a resource is counted twice.
