# GrantOS — Base44 Migration Status

**Last updated:** 2026-10-15
**Current state:** Migration complete and verified locally. Base44 independence confirmed. Local demo ready.
Invitation workflow rebuilt and verified (see §9). AI extraction still blocked on a valid API key (§6).

---

## 1. Where this started

The migration had been started in a previous session and stopped early. On inspection:

| Area | State found |
|---|---|
| Git | **No commits at all** — everything untracked and unprotected |
| `backend/` | Only `package.json` (a NestJS + Prisma dependency list). `backend/src` and `backend/prisma` were **empty directories** |
| `frontend/` | Untouched Base44 export. `@base44/sdk` + `@base44/vite-plugin` in dependencies; 86 files importing `base44` |
| Database | None — no schema, no migrations |
| `docs/base44-legacy-reference/` | **Complete and intact**: 24 entity schemas, 10 backend functions, the notification helpers, and the cron workflow definition |

Effective completion was about **2%** — a dependency manifest, no code. The decisive asset was the preserved
`docs/base44-legacy-reference/` tree, which carried the full schema and all business logic.

**Baseline commit `c59dcbe`** was created before any edit, so the original export is always recoverable.

---

## 2. What was built

### Backend — `backend/` (NestJS 10 + TypeScript + Prisma 5 + PostgreSQL 16)

The stack was kept as the previous session's `package.json` specified. That manifest was coherent and mapped
cleanly onto every requirement (argon2 → auth, nodemailer → email, `@nestjs/schedule` → cron, terminus → health),
so it was implemented rather than replaced.

| Module | Replaces | Notes |
|---|---|---|
| `prisma/schema.prisma` | Base44 hosted entities | 25 models translated 1:1 from the `.jsonc` definitions. Loose string FKs became **real foreign keys with cascades**. |
| `auth/` | Base44 hosted OAuth | Email + password, argon2id, JWT access token + rotating refresh token. The user is re-read from the database on every request, so disabling an account takes effect immediately. |
| `entities/` | `base44.entities.*` | One generic CRUD surface serving all 25 entities, driven by `entity-registry.ts`. |
| `files/` | `integrations.Core.UploadFile` | Content-addressed local storage (SHA-256), authorised download, path-traversal guard. |
| `ai/` | `integrations.Core.InvokeLLM` + 5 Deno extract functions | Server-side only. PDF text via `unpdf`; OpenAI called from the backend. |
| `notifications/` | `sendNotifications`, `sendTestNotification`, `SendEmail` | All six rules ported; cron via `@nestjs/schedule`. |
| `users/` | `base44.users.inviteUser` | Invite with generated temporary password. |
| `admin/` | `performDatabaseReset`, `performFileCleanup` | Admin-only, both write a `CleanupLog`. |
| `health/` | — | `/api/health`, `/live`, `/ready`. |

### Frontend — `frontend/` (React 18 + Vite 6)

The key decision: **`frontend/src/api/apiClient.ts` reproduces the Base44 SDK's exact method surface**
(`entities.<Name>.list/filter/get/create/update/delete`, `auth.*`, `users.inviteUser`,
`integrations.Core.*`, `functions.invoke` returning `{ data }`).

Because the shape matched, migrating 84 files was a **mechanical rename** (`base44.` → `api.`, one import line)
rather than a rewrite. The diff across those files contains **zero lines that are not the rename** — verified with
`git diff -U0`. All screens, workflows and business behaviour are untouched.

---

## 3. Base44 dependency checklist

| Dependency | Replacement | Verified by |
|---|---|---|
| `@base44/sdk` package | `frontend/src/api/apiClient.ts` | Removed from `package.json`; `node_modules/@base44` absent |
| `@base44/vite-plugin` | Removed; `@` alias moved into `vite.config.js` | Build succeeds without it |
| `base44.entities.*` (24 entities) | `GET/POST /api/entities/:entity[...]` | `api-smoke.ps1` — sort, filter, `$in`, FK, cascade |
| `base44.auth.*` | `/api/auth/login\|me\|refresh\|logout\|change-password` | `end-to-end.ps1` section C |
| `base44.users.inviteUser` | `POST /api/users/invite` | Implemented; **not exercised end-to-end** |
| `functions.invoke('getMyPermissions')` | `GET /api/auth/permissions` | `api-smoke.ps1` |
| `functions.invoke('sendNotifications')` | `POST /api/notifications/run` + cron | `end-to-end.ps1` section H |
| `functions.invoke('sendTestNotification')` | `POST /api/notifications/test` | Implemented; **not exercised end-to-end** |
| `functions.invoke('performDatabaseReset')` | `POST /api/admin/performDatabaseReset` | Implemented; **deliberately not run** (destructive) |
| `functions.invoke('performFileCleanup')` | `POST /api/admin/performFileCleanup` | Implemented; **deliberately not run** (destructive) |
| 5 `extract*` Deno functions | `POST /api/extraction/*` | Pipeline verified; **model call not run** (see §6) |
| `integrations.Core.UploadFile` | `POST /api/files/upload` | `end-to-end.ps1` section F |
| `integrations.Core.InvokeLLM` | `POST /api/ai/invoke` (backend-only key) | Status endpoint verified |
| `integrations.Core.SendEmail` | `POST /api/notifications/send-email` | Routed through the same mailer guardrails |
| Base44 cron workflow (03:30 UTC) | `@Cron` in `notifications.service.ts`, same expression | Manual trigger verified |
| `app-params.js` (Base44 app id/token) | Deleted | File removed |
| `OAuthConsent.jsx` (Base44 MCP consent) | Deleted — orphaned, not routed | File removed |
| **Favicon fetched from `base44.com`** | Local `public/favicon.svg` | Was a live outbound call on every page load |
| Digest email link to `app.base44.com` | `APP_PUBLIC_URL` | Unit-tested |

**Independence check:** zero occurrences of `base44` across all files in `frontend/dist/` after a production build.

---

## 4. Files changed

**Created — backend (33):** `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/20261015042909_init/`,
`src/main.ts`, `src/app.module.ts`, `src/config/configuration.ts`, `src/prisma/*` (2),
`src/common/*` (3), `src/auth/*` (4), `src/users/*` (3), `src/entities/*` (6),
`src/files/*` (4), `src/ai/*` (6), `src/notifications/*` (5), `src/admin/*` (3), `src/health/*` (2),
`tsconfig.json`, `nest-cli.json`, `.env.example`, `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore`,
`test/make-fixtures.js`, 3 `.spec.ts` files.

**Created — frontend (7):** `src/api/apiClient.ts`, `src/pages/Login.jsx`, `tsconfig.json`,
`public/favicon.svg`, `public/manifest.json`, `Dockerfile`, `nginx.conf`, `.dockerignore`.

**Created — root (4):** `docker-compose.yml`, `MIGRATION_STATUS.md`, `LOCAL_DEMO_GUIDE.md`, `scripts/verify/*` (4).

**Rewritten — frontend (6):** `src/lib/AuthContext.jsx`, `src/App.jsx`,
`src/components/dashboard/NotificationChecker.jsx`, `vite.config.js`, `index.html`, `package.json`.

**Mechanically renamed (84):** every file that imported the Base44 SDK. Rename only — no logic changes.

**Deleted (3):** `src/api/base44Client.js`, `src/lib/app-params.js`, `src/pages/OAuthConsent.jsx`.

**Untouched:** all 180+ UI components, pages, hooks and `components/ui/*` beyond the rename.

---

## 5. Commands run and results

| Command | Result |
|---|---|
| `npm install` (backend) | 818 packages |
| `npm install` (frontend) | 592 packages, **no `@base44/*`** |
| `npx prisma validate` | Schema valid |
| `npx prisma migrate dev --name init` | Applied `20261015042909_init` |
| `npm run seed` | 3 grants, 2 MoUs, 2 MSAs, 2 SOWs, 2 users |
| `npm run seed` (again) | Counts unchanged — **idempotent** |
| `npm run build` (backend) | Clean |
| `npm run build` (frontend) | Clean, 1.1 MB bundle |
| `npx tsc --noEmit` (backend) | No errors |
| `npx jest` | **70/70 passing**, 3 suites |
| `scripts/verify/api-smoke.ps1` | **35/35 passing** |
| `scripts/verify/end-to-end.ps1` | **43/43 passing** |
| `scripts/verify/persistence.ps1` | **14/14 passing** |
| `scripts/verify/clean-database.ps1` | **15/15 passing** |

**Total: 177 automated checks passing.**

### Bugs found and fixed during verification

1. **Mapped enums rejected.** The UI sends Base44 display values (`"Quarterly Report"`), Prisma expects member
   names (`Quarterly_Report`). Added bidirectional translation in `serializer.ts` driven by Prisma's DMMF.
   *Would have broken reporting obligations, review cycles, MoU responsible-party and reporting cycles.*
2. **Cookie-authenticated downloads returned 401.** The global JWT guard rejected the request before
   `FileSessionGuard` ran. Added `@Public()` so the route's own guard authenticates it.
   *Would have broken every "view document" link in the UI.*
3. **Decimal columns serialised as strings.** Would have made dashboard totals concatenate instead of add
   (`"1250000" + 0` → `"12500000"`). Fixed in the serializer, covered by a unit test.
4. **Favicon fetched from `base44.com`** on every page load — a live dependency hiding in `index.html`.
5. **Malformed PDFs returned 500.** Now a 400 naming the parser's reason.
6. **`pdf-parse` could not read valid PDFs.** The package is abandoned and bundles an ancient pdf.js; it failed
   even on jsPDF output. Replaced with `unpdf`, which the original Base44 function also used.
7. **Password policy mismatch.** UI required 8 chars + complexity; backend required 10 with no complexity.
   Backend now enforces the same rule as the UI.
8. **Stale TypeScript incremental cache** made `nest build` silently emit nothing after a `dist` wipe.
   `tsBuildInfoFile` moved inside `dist`.
9. **Scanned-PDF threshold too aggressive** (200 chars) — would have blocked short but genuine documents with no
   fallback. Now `< 50` chars total or `< 15` per page.

### One mistake made and corrected

The first pass of the bulk rename used PowerShell's default ANSI encoding, which corrupted UTF-8 characters
(em-dashes → mojibake) in 66 files. Caught by comparing bytes against `git show HEAD:<path>`, reverted with
`git checkout`, and redone with explicit UTF-8 on both read and write. Verified clean afterwards. This is the
reason the baseline commit was made first.

---

## 6. Remaining work and blockers

### Blocked / not verified

| Item | Status | Why | How to resolve |
|---|---|---|---|
| **Live AI extraction** | ✅ **Working (2026-10-16)** | A valid key is now in `backend/.env`. Minimal connectivity check returned `{"ok":true}` in 2.7 s; full extraction returned **6 deliverables and 6 milestones** with correct amounts, dates and source sections in 15.6 s on `gpt-4o-mini`. | — |
| **Gmail SMTP** | ✅ **Working (2026-10-17)** | `transporter.verify()` completed a real AUTH handshake against `smtp.gmail.com:587`; one labelled test email to the sender account returned `status: sent`. | Confirm the message arrived in the inbox. |
| **Browser UI verification** | ⚠️ Not done | The `chrome-devtools` MCP server failed to connect this session. | Manual steps in `LOCAL_DEMO_GUIDE.md` → "Five-minute walkthrough". |
| **Base44 data import** | ❌ Not possible | The export contains **source code and schema only** — no database rows and no uploaded PDFs. | Requires a data export from Base44. See §7. |
| `inviteUser`, `sendTestNotification`, DB reset, file cleanup | Implemented, not exercised | Destructive or needs a UI flow. | Exercise manually during the demo. |

#### What the AI extraction attempt established

The run was approved and executed against the real endpoint. It got as far as the provider and failed there:

| Stage | Result |
|---|---|
| Upload and store the PDF | ✅ worked |
| Resolve `pdf_url` → stored file | ✅ worked |
| Extract the text layer (`unpdf`) | ✅ **803 characters from 1 page** |
| Build the prompt and call OpenAI | ❌ `401 Incorrect API key provided` |
| Report the failure | ✅ `503`, nothing fabricated, nothing saved |

So everything this migration is responsible for works; only the external credential is bad. The model call itself
remains **unverified**.

The run also exposed a leak: the provider's raw error — which embeds a partially-masked key and account URLs —
was being passed straight through to the browser. Provider errors are now logged in full server-side and
translated into a safe, actionable message (`invalid_credentials`, `rate_limited_or_quota`, `model_unavailable`,
`provider_error`).

To finish this check, set a working key in `backend/.env` and retry:

```powershell
# backend/.env  ->  OPENAI_API_KEY=sk-proj-...   (no trailing full stop)
cd backend; npm run start:dev
powershell -File scripts\verify\ai-extraction.ps1
```

#### Two configuration traps removed on 2026-10-15

Both were found because a reported key change had no effect:

1. **`.env` was being ignored.** dotenv never overwrites an existing process
   variable, so a stale `OPENAI_API_KEY` in the Windows user environment
   silently beat the file. `src/config/load-env.ts` now loads `.env` first with
   **file-wins** precedence (a non-empty file value overrides an inherited one;
   a blank one defers, so container injection still works) and logs every
   override **by name, never by value**.
2. **A mis-copied key produced an opaque 401.** The configured key ended with a
   `.` — invisible in a 165-character string. `describeSuspectApiKey()` now
   checks for a trailing `.`/`,`/`;`, wrapping quotes, inner whitespace and a
   missing `sk-` prefix, and reports the specific fault at startup and in
   `/api/ai/status`.

### Known limitations

- **No OCR.** Scanned PDFs are rejected with an explicit message. The original fell back to a vision model; that
  path was not reintroduced. Text-layer PDFs work.
- **`NotificationChecker` is not mounted anywhere.** It was already dead code in the export (nothing imports it).
  It was rewritten to trigger the backend rather than send mail from the browser, but mounting it is a UI decision
  left alone to preserve current behaviour. The backend cron is the live path.
- **Bundle is 1.1 MB** (unchanged from the export). Code-splitting was out of scope.
- **`@nestjs/platform-express` 10 pins multer 1.x internally**, which carries a DoS advisory. Not reachable in a
  local demo; resolving it means upgrading to NestJS 11.
- **Empty `OPENAI_API_KEY=` in `.env` does not override an inherited shell variable** — dotenv never overwrites an
  existing process variable. Documented in `.env.example`.

### Exact next step if this session stops

Everything required for the demo is done. The highest-value next action is **browser verification**:

```powershell
cd C:\Users\sruz\Project\venu\GrantOS\GrantOSBase44
docker compose up -d
cd backend;  npm run start:dev      # terminal 1
cd frontend; npm run dev            # terminal 2
# open http://localhost:5173 and follow LOCAL_DEMO_GUIDE.md §5
```

Then decide on live AI extraction (see the table above).

---

## 7. Data honesty

**Everything currently in the database is seeded demo data and is clearly fictional.** Organisations
("Meridian Development Foundation", "Lumen Software Services"), people, email addresses (all `@grantos.local`)
and amounts are invented. No client record is present.

**The Base44 export does not contain your production data.** It contains source code, entity *schemas* and
backend function source — not database rows and not uploaded documents. Any statement that the migration carries
your records across would be false.

To bring real data over you will need, from Base44:
1. A **data export** of each entity (CSV or JSON).
2. The **stored PDFs**, with a mapping from each file to its parent record.

Once those exist, an importer can map them onto this schema — the column names were kept identical to the Base44
field names specifically to keep that mapping direct. Note that old `pdf_url` values pointing at Base44-hosted
files will be unreachable and must be re-pointed at re-uploaded documents; the extraction endpoints already return
an explicit error for such URLs rather than failing silently.

---

## 8. Decisions worth knowing

| Decision | Reason |
|---|---|
| Invitation **tokens** rather than emailed passwords | A password in an inbox is a standing credential; a hashed, expiring, single-use token is not. It also removes the window where a new account existed with no permissions set. |
| Permissions stored **on the invitation** | The old flow created the account and then patched permissions, leaving the user unrestricted in between. |
| Kept **NestJS** rather than switching to Express | The previous session's manifest chose it and mapped onto every requirement. Nothing depended on it yet, but there was no reason to discard a coherent plan. |
| Kept the UI in **JSX**, added TypeScript for the new API layer | Converting 180 working components to TSX is a large, risky rewrite with no behavioural benefit. TypeScript is used where the new contracts live. |
| **Compatibility client** instead of refactoring call sites | Turned an 86-file rewrite into an 84-file rename and preserved all behaviour. |
| **Generic CRUD** instead of 25 Nest modules | One authorisation path to audit instead of 25 copies. |
| Enforced authorisation **per entity in a registry** | The Base44 `rls` rules translate directly and stay reviewable in one file. |
| Unique index for notification **dedup** | The original read-then-filter could double-send under concurrency; a constraint cannot. |
| **Same-origin `/api`** via Vite/nginx proxy | Makes the document-download cookie work and removes CORS from normal operation. |
| Non-default host ports (**55432**, 3001, 5173) | Ports 5432 and 4000 were already in use on this machine. |
| **Seed never deletes** | Fixed UUIDs + upsert, so re-running is safe and your own records are never touched. |

---

## 9. Invitation workflow — rebuilt 2026-10-15

### Why invitations failed

Reproduced against the live API. Five separate faults, none of them SMTP:

| # | Symptom | Cause |
|---|---|---|
| 1 | Invite dialog hangs, no error shown | `handleInvite` in `UserAdmin.jsx` had **no try/catch**. A rejected request escaped the async handler, so `setInviting(false)` never ran and no toast appeared. |
| 2 | **Resend always failed** | `handleResendInvite` called the create-only endpoint, which returns **409 Conflict** for anyone who already exists. |
| 3 | No invitation existed | The endpoint created a **live account immediately** and emailed a **plaintext temporary password**. No invitation record, no token, no expiry, no single use, and no link in the email. |
| 4 | `must_change_password` never enforced | The invited user signed in and used the API indefinitely without changing it. |
| 5 | New users briefly **unrestricted** | The UI created the account, then polled up to five times to PATCH permissions. In that window `allowed_modules: []` meant *all modules*; a failed PATCH left it that way. |

A sixth fault surfaced during verification: `JwtStrategy` compared the JWT `iat`
claim (whole seconds, per RFC 7519) against `tokens_valid_from` (milliseconds),
so **any login in the same second as account creation or a password change was
rejected** with "Session expired". Fixed with a 1-second leeway in both
`jwt.strategy.ts` and `file-session.guard.ts`.

### What replaced it

| Piece | Behaviour |
|---|---|
| `Invitation` model | email, **SHA-256 token hash only**, role, permissions, expiry, `accepted_at`, `revoked_at`, `sent_count`, `invited_by` |
| `POST /api/users/invite` (admin) | Creates a pending invitation. **No account is created.** |
| `GET /api/invitations/:token` (public) | Preview for the acceptance page. Returns no secret material. |
| `POST /api/invitations/:token/accept` (public) | Recipient sets their own password; account created. |
| `POST /api/admin/invitations/:id/resend` | Issues a **new** token and revokes the previous one. |
| `DELETE /api/admin/invitations/:id` | Revokes a pending link. |
| `GET /api/admin/invitations` | Pending-invitation list, surfaced in the UI. |
| `/invite/:token` (frontend) | Public acceptance page. |

Security properties, each covered by a test:

- Token is 32 random bytes; **only its SHA-256 hash is stored**.
- **Single use** — `accepted_at` is claimed by a conditional `updateMany` inside the same transaction that creates the user, so two simultaneous submissions cannot both succeed.
- **Expiring** — `INVITATION_EXPIRY_DAYS`, default 7.
- **No privilege escalation** — role, modules and upload permission are read from the stored invitation. A `role: "admin"` field in the acceptance body is ignored; verified explicitly.
- **No duplicate accounts** — inviting an existing account returns 409 with an explanation; resend replaces the token instead of creating a row.
- Acceptance endpoints are rate limited; the admin endpoints require the admin role.

### Verification

`scripts/verify/invitations.ps1` — **52/52 passing**, covering the full sequence
(invite → stored → email → link → password → sign in with the assigned role)
plus single use, expiry, revocation, resend, duplicates, garbage tokens,
escalation attempts, and that the raw token never reaches the database.

`src/users/invitations.service.spec.ts` — **32 unit tests** on the same rules in
isolation.

Full regression after the change: **246 checks passing**
(102 unit + 35 smoke + 43 e2e + 14 persistence + 52 invitations).

### "Mailpit is not working" — it was the recipient allow-list

Reported 2026-10-15. Mailpit was healthy throughout: containers up, ports 8025
and 1025 listening, API responding, and a test send to `@grantos.local` arrived
immediately.

The real cause was `MAIL_ALLOWED_DOMAINS`. Invitations to ordinary addresses
(`@egov.org.in`, `@gmail.com`) were **refused by our own guard** before reaching
SMTP, so nothing appeared in Mailpit and it looked broken.

That guard exists to stop demo data emailing real people — a risk that only
exists with a **real relay**. Scoping corrected:

- **Local capture (Mailpit):** the allow-list is **not** applied. Nothing can
  leave the machine, so any address may be invited.
- **Real delivery:** the allow-list is enforced as before.
- A refusal now returns an **error naming the domain and the fix**, and the
  ad-hoc send endpoint fails loudly instead of returning `200` with
  `status: "skipped"`.

Verified after the change: inviting `mailtest.demo@gmail.com` reports
`email_status: sent` and the message appears in Mailpit.

### Mailpit removed; Gmail SMTP wired in (2026-10-16)

Mail now goes through a real provider configured in `backend/.env`. Mailpit is
no longer part of the application or the stack.

**Removed:** the `mailpit` service, its ports (8025/1025), its healthcheck, its
`grantos-mailpit` volume declaration and the `backend` service's `depends_on`
entry — all from `docker-compose.yml`. The backend's hardcoded
`SMTP_HOST: mailpit` / `SMTP_PORT: 1025` are gone; the container now reads
`backend/.env` through `env_file`, so **no secret appears in compose**. The
existing `grantos-mailpit` Docker volume was deliberately **not deleted**.

`MailerService.isLocalCapture` still recognises `localhost`/`mailpit`/`mailhog`
hosts. That is not a dependency — it is how the service decides whether to
apply the recipient allow-list and whether a self-signed certificate is
acceptable, so running a capture tool again stays a pure configuration change.

**Transport correctness.** `SMTP_SECURE=false` selects STARTTLS on port 587, so
the transport now sets `requireTLS` (a server refusing the upgrade is rejected
rather than sent to in clear text), validates certificates for any real relay,
and requires TLS 1.2 or better. Previously `rejectUnauthorized` followed
`NODE_ENV`, which disabled certificate validation in development — wrong for a
real provider.

**Gmail app passwords.** Google displays them as four groups of four
("abcd efgh ijkl mnop"). Those spaces are presentation only and break AUTH if
sent verbatim, so every whitespace character is now stripped from `SMTP_PASS`.

**Honest reporting.** A dry run returns `skipped`, never `sent`; a refused
recipient returns `skipped` with the reason; a transport failure returns
`failed`. There is no fallback to a local sink.

### Gmail SMTP commissioned (2026-10-17)

Authentication succeeded and one labelled test email was delivered to the
sending account. Scheduled notifications are **disabled**
(`NOTIFICATIONS_CRON_ENABLED=false`), and no demo contact or existing user was
emailed.

Three configuration faults were found and corrected in `backend/.env`, with a
timestamped backup taken first:

| Fault | Effect | Fix |
|---|---|---|
| `NOTIFICATIONS_CRON_ENABLED` assigned **twice** — `false` on line 62, a stale `true` on line 66 | The last assignment wins, so the cron was **still enabled** despite the edit | Stale line removed |
| `MAIL_FROM_ADDRESS` assigned twice (values identical) | Harmless, but the same trap one edit away | Duplicate removed |
| `EMAIL_FROM` set | Never read by the application — had no effect | Removed as redundant |

`load-env.ts` now reports duplicate assignments at startup, naming the variable
and explaining that only the last takes effect. That is how this class of fault
becomes visible rather than silent.

**Sender self-send exception.** `MAIL_ALLOWED_DOMAINS` does not include the
sender's domain, so even a self-addressed test would have been refused. The
configured `SMTP_USER` / `MAIL_FROM_ADDRESS` is now always an allowed
recipient — a message to the sending account cannot reach a third party. Every
other address is still subject to the allow-list, including other addresses on
the same domain (covered by unit tests).

**Automated checks cannot send real mail.** `scripts/verify/end-to-end.ps1`
reads the SMTP mode and switches notification processing to `dry_run` when
delivery is live. `scripts/verify/invitations.ps1` refuses to run entirely
under real delivery unless `GRANTOS_ALLOW_REAL_SEND=1` is set, because each
invitation it creates would attempt delivery to a non-existent
`@grantos.local` domain and generate bounces.

### Recipient policy split from demo protection (2026-10-17)

Inviting a Gmail address failed because a single `MAIL_ALLOWED_DOMAINS`
allow-list governed **all** mail. Adding `gmail.com` and `outlook.com` to that
list would have been whack-a-mole, so the two distinct concerns were separated.

| Setting | Applies to | Values |
|---|---|---|
| `MAIL_RECIPIENT_POLICY` | invitations, password resets, admin-initiated sends | `unrestricted` (default) or `allowlist` — nothing else |
| `MAIL_ALLOWED_DOMAINS` | consulted only under `allowlist` | comma-separated domains |
| `NOTIFICATION_BLOCKED_DOMAINS` | the automated notification run only | comma-separated domains; defaults to the demo domains |

`MAIL_RECIPIENT_POLICY` rejects `""`, `*`, `all`, `none` and any other value at
startup rather than guessing — choosing wrongly would either email strangers or
block every genuine recipient.

`MailerService.send` now takes a `purpose` of `transactional` (default) or
`notification`. Only `processNotifications` — the scheduled bulk path — passes
`notification`, so the demo-domain block applies there and nowhere else. All 14
seeded record contacts and the global alert list sit on `grantos.local`, so the
scheduled digest cannot reach any of them, **without a single contact record
being edited**.

Check order in `isAllowedRecipient`: syntax → notification block → local
capture → sender self-send → policy. The notification block deliberately
precedes the local-capture exemption, so a capture tool cannot make the
protection silently vanish.

Email-address validation, authentication, role checks and the throttler are
unchanged.

**Verified with mocks** (`mailer.service.spec.ts`, `configuration.spec.ts`):
Gmail, plus-tagged Gmail, Googlemail, Outlook, Hotmail, Microsoft 365 company
domains, company subdomains, `egov.org.in`, hyphenated and numeric-label
domains are all accepted; six malformed address shapes are rejected; demo
domains are refused for notifications but accepted for invitations;
`notexample.com` is correctly not matched by `example.com`; an empty allow-list
under `allowlist` means nobody, not everybody. **201 unit tests passing.**

### Still unverified

**Browser verification was not possible** — the `chrome-devtools` MCP server
failed to connect again this session. Everything above was exercised over HTTP
against the running stack, which is *not* the same as driving the UI. What HTTP
cannot confirm: the dialog's error toast actually renders, the pending-invitation
panel paints, and the acceptance form submits from a real browser. The SPA was
confirmed to serve `/invite/:token` (HTTP 200, app shell, correct title) and the
preview API the page calls on load returns the right data — so routing is sound,
but the rendering is unverified. Manual steps are in `LOCAL_DEMO_GUIDE.md` §11.
