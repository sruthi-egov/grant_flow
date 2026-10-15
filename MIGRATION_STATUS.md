# GrantOS — Base44 Migration Status

**Last updated:** 2026-10-15
**Current state:** Migration complete and verified locally. Base44 independence confirmed. Local demo ready.

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
| **Live AI extraction** | ❌ **Blocked — the API key is invalid** | Ran with approval. The `OPENAI_API_KEY` in the Windows *user* environment is rejected by OpenAI: `401 Incorrect API key provided`. The key is expired, revoked, or mistyped. | Set a valid key and re-run `scripts/verify/` or use the UI. See below. |
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

To finish this check, set a working key and retry:

```powershell
$env:OPENAI_API_KEY = 'sk-...'      # or edit backend/.env
cd backend; npm run start:dev       # restart so it is picked up
# then use "Extract from PDF" on a grant in the UI with a text-layer PDF
```

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
| Kept **NestJS** rather than switching to Express | The previous session's manifest chose it and mapped onto every requirement. Nothing depended on it yet, but there was no reason to discard a coherent plan. |
| Kept the UI in **JSX**, added TypeScript for the new API layer | Converting 180 working components to TSX is a large, risky rewrite with no behavioural benefit. TypeScript is used where the new contracts live. |
| **Compatibility client** instead of refactoring call sites | Turned an 86-file rewrite into an 84-file rename and preserved all behaviour. |
| **Generic CRUD** instead of 25 Nest modules | One authorisation path to audit instead of 25 copies. |
| Enforced authorisation **per entity in a registry** | The Base44 `rls` rules translate directly and stay reviewable in one file. |
| Unique index for notification **dedup** | The original read-then-filter could double-send under concurrency; a constraint cannot. |
| **Same-origin `/api`** via Vite/nginx proxy | Makes the document-download cookie work and removes CORS from normal operation. |
| Non-default host ports (**55432**, 3001, 5173) | Ports 5432 and 4000 were already in use on this machine. |
| **Seed never deletes** | Fixed UUIDs + upsert, so re-running is safe and your own records are never touched. |
