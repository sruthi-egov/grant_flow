# GrantOS — Technical Stack & Deployment Handover

**Prepared:** 2026-10-26
**Commit assessed:** `5026d21`
**Method:** read-only inspection of manifests, lockfiles, Prisma schema and migrations, Dockerfiles, Compose, nginx config, entrypoint script and application source. No code, configuration or data was modified; no migrations, seeds, emails or paid API calls were executed.

Anything that could not be verified from the repository is marked **UNVERIFIED**. Resource figures are **preliminary estimates**, not measurements.

---

## 1. Technology stack

Versions are shown as *declared range* → *resolved in lockfile*, because the lockfile is what actually ships.

### Frontend

| Component | Technology | Version (declared → resolved) | Purpose | Source |
|---|---|---|---|---|
| UI framework | React | `^18.2.0` → **18.3.1** | SPA runtime | `frontend/package.json`, `package-lock.json` |
| Build tool | Vite | `^6.1.0` → **6.4.4** | Dev server, production bundler | `frontend/package.json`, `vite.config.js` |
| Routing | react-router-dom | `^6.26.0` → **6.30.6** | Client-side routing | `frontend/src/App.jsx` |
| Server state | @tanstack/react-query | `^5.84.1` → **5.104.2** | Query caching | `frontend/src/lib/query-client.js` |
| Styling | Tailwind CSS | `^3.4.17` → **3.4.19** | Utility CSS | `frontend/tailwind.config.js` |
| Styling plugin | tailwindcss-animate | `^1.0.7` | Animation utilities (Tailwind plugin, not an `src` import) | `frontend/tailwind.config.js:88` |
| UI primitives | Radix UI (26 packages) | `^1.x`–`^2.x` | Accessible primitives behind `components/ui/*` | `frontend/package.json` |
| Icons | lucide-react | `^0.475.0` → **0.475.0** | Icon set | `frontend/src/lib/navigation.js` |
| Charts | recharts | `^2.15.4` → **2.15.4** | Dashboard/report charts | `frontend/src/components/ui/chart.jsx` |
| Dates | date-fns | `^3.6.0` → **3.6.0** | Date formatting/arithmetic | `frontend/src/components/dashboard/*` |
| Forms | react-hook-form | `^7.54.2` | Form state | `frontend/src/components/ui/form.jsx` |
| Toasts | sonner | `^2.0.1` | Notifications | `frontend/src/App.jsx` |
| Language | TypeScript | `^5.8.2` → **5.9.3** | Types for the API layer; UI is JSX | `frontend/tsconfig.json` |

> **Note:** the UI is predominantly `.jsx`. TypeScript is used for the API client (`src/api/apiClient.ts`) and navigation config. `npm run typecheck` only covers `src/**/*.ts(x)`.

### Backend

| Component | Technology | Version (declared → resolved) | Purpose | Source |
|---|---|---|---|---|
| Framework | NestJS | `^10.4.15` → **10.4.22** | HTTP API, DI, modules | `backend/package.json`, `src/main.ts` |
| HTTP server | Express (via `@nestjs/platform-express`) | → **4.22.1** | Underlying HTTP layer | lockfile |
| Language | TypeScript | `^5.7.2` → **5.9.3** | Compiled to CommonJS | `backend/tsconfig.json` |
| ORM | Prisma Client | `^5.22.0` → **5.22.0** | DB access, migrations | `backend/prisma/schema.prisma` |
| Database | PostgreSQL | **16** (`postgres:16-alpine`) | Primary datastore | `docker-compose.yml:23` |
| Auth — tokens | `@nestjs/jwt` + `passport-jwt` | `^10.2.0` / **4.0.1** | JWT access + refresh | `src/auth/jwt.strategy.ts` |
| Auth — hashing | argon2 | `^0.41.1` → **0.41.1** | argon2id password hashing | `src/auth/auth.service.ts` |
| Security headers | helmet | `^8.0.0` → **8.3.0** | HTTP hardening | `src/main.ts` |
| Rate limiting | `@nestjs/throttler` | `^6.2.1` | 300 req/60s global; tighter on auth routes | `src/app.module.ts` |
| Validation | class-validator (+ class-transformer) | `^0.14.1` / `^0.5.1` | DTO validation; `transform: true` | `src/main.ts:68` |
| Email | nodemailer | `^6.9.16` → **6.10.1** | SMTP delivery | `src/notifications/mailer.service.ts` |
| AI | openai | `^4.73.1` → **4.104.0** | Document extraction | `src/ai/ai.service.ts` |
| PDF text | unpdf | `^1.8.1` → **1.8.1** | PDF text layer extraction (**dynamic ESM import**) | `src/ai/pdf-text.service.ts:42` |
| Scheduler | `@nestjs/schedule` | `^4.1.1` → **4.1.2** | In-process cron | `src/notifications/notifications.service.ts:54` |
| API docs | `@nestjs/swagger` | `^7.4.2` | Swagger UI, **non-production only** | `src/main.ts:79` |
| File storage | Node `fs` | built-in | Content-addressed local disk | `src/files/files.service.ts` |

### Infrastructure / tooling

| Component | Technology | Version | Purpose | Source |
|---|---|---|---|---|
| Container runtime (backend) | `node:22-alpine` | Node **22** | Production backend image | `backend/Dockerfile:7,28` |
| Container runtime (frontend) | `nginx:1.27-alpine` | nginx **1.27** | Static serving + `/api` reverse proxy | `frontend/Dockerfile` |
| Orchestration | Docker Compose | schema v2 (`name:`, `profiles:`) | Local/single-host stack | `docker-compose.yml` |
| Package manager | **npm** | lockfileVersion **3** | Both workspaces | `*/package-lock.json` |
| OS packages | `openssl`, `tini` | — | Prisma engines; PID-1 signal handling | `backend/Dockerfile:12,32` |

### Queues / cache / background workers

**None.** There is no Redis, no BullMQ, no Agenda, no separate worker process. The only background work is a single in-process cron (§2.5). Verified by dependency scan and by the absence of any queue library in either manifest.

### Runtime version: project vs this laptop

| | Version | Source |
|---|---|---|
| **Project target (production)** | **Node 22** (alpine) | `backend/Dockerfile`, `frontend/Dockerfile` |
| **This laptop** | Node **24.14.0**, npm **11.9.0** | `node -v`, `npm -v` |
| Docker on this laptop | **29.2.1** | `docker --version` |

⚠️ **There is no `engines` field, `.nvmrc` or `.node-version` anywhere in the repo.** The Docker base image is the only declaration of the required Node version, and local development is running a *different major version* (24) from production (22). Nothing has pinned this. CI and production should standardise on Node 22 to match the images, or the images should be moved to 24 deliberately.

### Dependencies declared but **not used** at runtime

Verified by scanning all 182 frontend source/config files and all backend `.ts` files for genuine `import`/`require` statements (substring matches in comments and prose were excluded).

**Frontend — 17 unused** (Base44 scaffold leftovers; roughly 20–25 MB of `node_modules`, and they are tree-shaken out of the bundle):

`@hello-pangea/dnd`, `@hookform/resolvers`, `@radix-ui/react-toast`, `@stripe/react-stripe-js`, `@stripe/stripe-js`, `canvas-confetti`, `framer-motion`, `html2canvas`, `jspdf`, `lodash`, `moment`, `react-hot-toast`, `react-leaflet`, `react-markdown`, `react-quill`, `three`, `zod`

> `components/ui/toast.jsx` is a hand-written shim that does **not** use `@radix-ui/react-toast`. `moment` and `react-hot-toast` appear only inside prose/comments.

**Backend — 3 unused:** `@nestjs/terminus` (health endpoints are hand-written), `nanoid`, `uuid` (IDs come from `crypto.randomBytes` and Prisma `uuid()`).

**Deliberately retained despite no direct import:** `reflect-metadata`, `rxjs`, `passport`, `class-transformer` — all required at runtime by NestJS. `@types/multer` remains as a type-only dev dependency; `FileInterceptor` ships inside `@nestjs/platform-express`.

Removing the unused packages is low-risk but is a **code change** and therefore out of scope for this read-only assessment.

---

## 2. Deployment requirements

### 2.1 Frontend

| | |
|---|---|
| Build | `npm ci && npm run build` |
| Output | `frontend/dist/` (`index.html`, `assets/`) |
| Production serving | nginx serves `dist` and reverse-proxies `/api/` → `http://backend:3001` |
| Listening port | **80** in-container (`FRONTEND_HOST_PORT`, default 5173, on the host) |
| Outbound needs | none — the browser reaches the API through the nginx proxy |
| Persistent storage | none (stateless) |
| Health check | `GET /` (`wget` in the image `HEALTHCHECK`) |
| Dockerfile | ✅ exists, multi-stage, production-ready |

**Build-time coupling:** `VITE_API_BASE_URL` is a build `ARG` baked into the bundle. Default is empty, which makes the client call same-origin `/api` — the correct setting when nginx proxies. Changing it requires a **rebuild**, not a restart.

`nginx.conf` sets `client_max_body_size 32m`, SPA fallback `try_files $uri $uri/ /index.html`, and a 180 s proxy timeout for uploads/extraction.

### 2.2 Backend

| | |
|---|---|
| Build | `npm ci && npx prisma generate && npm run build` |
| Output | `backend/dist/` (entry `dist/main.js`) |
| Production start | `node dist/main.js` (`npm run start:prod`) |
| Container entry | `tini` → `docker-entrypoint.sh` → runs `prisma migrate deploy`, then execs the CMD |
| Listening port | **3001** (`PORT`) |
| Global prefix | all routes under `/api` |
| Outbound needs | PostgreSQL 5432; SMTP 587; `api.openai.com` 443 (optional) |
| Persistent storage | **`UPLOAD_DIR`** — `/app/storage/uploads` in-container, volume `grantos-uploads` |
| OS dependencies | `openssl` (Prisma engines on Alpine), `tini` |
| Runs as | non-root `node` user |
| Dockerfile | ✅ exists, multi-stage, prunes dev deps, production-ready |

**Health endpoints** (all public, no auth — `src/health/health.controller.ts`):

| Endpoint | Purpose |
|---|---|
| `GET /api/health/live` | Liveness — process up. Used by the Compose healthcheck. |
| `GET /api/health/ready` | Readiness — executes `SELECT 1` against PostgreSQL. |
| `GET /api/health` | Full status: DB latency, SMTP reachability, AI configured flag. Optional integrations are reported separately so a missing AI key never marks the service unhealthy. |

**Production boot guards** (`src/main.ts`): the process **exits 1** if either JWT secret is missing or under 24 characters, or if — when `NODE_ENV=production` — either still begins with `dev-only-`. Swagger is mounted at `/api/docs` **only when `NODE_ENV !== production`**.

### 2.3 Database

| | |
|---|---|
| Engine | PostgreSQL **16** |
| Schema | 28 Prisma models, 38 enums, 14 explicit relations → **29 tables** in `public` |
| Migrations | 2, in `backend/prisma/migrations/`: `20261015042909_init`, `20261015065751_add_invitations` |
| Apply command | `npx prisma migrate deploy` (runs automatically in the container entrypoint) |
| Port | 5432 (host 55432 in Compose, chosen to avoid collisions) |
| Persistent volume | `grantos-pgdata` → `/var/lib/postgresql/data` |
| Health check | `pg_isready` |
| Extensions required | **none** |
| Current size | **~10 MB** (demo data only) |

### 2.4 File storage

**Uploads are stored on the local filesystem — not in the database and not in object storage.**

- `src/files/files.service.ts` writes to `UPLOAD_DIR`, content-addressed: SHA-256 of the bytes, sharded by the first two hex characters (`<root>/ab/<full-sha256>`). Identical uploads are de-duplicated to one blob.
- PostgreSQL stores only metadata in `stored_files` (`storage_path`, `mime_type`, `size_bytes`, `sha256`, `original_name`, owning entity). **Blob bytes are never in the database.**
- Download is authorised (`/api/files/:id/download`) and the service refuses any `storage_path` resolving outside the upload root.
- Current local volume: **4 files, ~0.9 MB**.

⚠️ **This is the main constraint on horizontal scaling.** Two backend replicas with separate disks would each serve only their own uploads. Options: a shared RWX volume (NFS/EFS/Azure Files), pinning to one replica, or adding an S3-compatible adapter. **No object-storage adapter exists today** — adding one is a code change.

### 2.5 Extra processes

**None required.** There is no separate worker or scheduler container. One in-process cron is registered via `@nestjs/schedule`:

- `src/notifications/notifications.service.ts:54` — `@Cron(NOTIFICATIONS_CRON ?? '30 3 * * *')`, timezone UTC (`30 3 * * *` = 09:00 Asia/Kolkata).
- Gated by `NOTIFICATIONS_CRON_ENABLED`; when false the handler logs and returns immediately.
- An in-process `running` flag prevents overlap **within a single instance** only.

---

## 3. Configuration

Exact variable names read by the code. **No real values appear here — placeholders only.**

### Backend (runtime)

| Variable | Purpose | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | **Yes** | Read by Prisma via `env()` in `schema.prisma`, not `process.env` |
| `NODE_ENV` | Environment mode | Recommended | `production` enables the secret guard, disables Swagger, sets the `Secure` cookie flag |
| `PORT` | Listen port | No | Default `3001` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | **Yes in production** | Defaults to `http://localhost:5173,http://127.0.0.1:5173` |
| `APP_PUBLIC_URL` | Base URL embedded in invitation and notification emails | **Yes in production** | Defaults to `http://localhost:5173` — see blockers |
| `JWT_ACCESS_SECRET` | Access-token signing key | **Yes** | ≥24 chars; must not start with `dev-only-` in production |
| `JWT_REFRESH_SECRET` | Refresh-token signing key | **Yes** | Same rules |
| `JWT_ACCESS_TTL` | Access-token lifetime | No | Default `15m` |
| `JWT_REFRESH_TTL` | Refresh-token lifetime | No | Default `7d` |
| `UPLOAD_DIR` | Upload root directory | **Yes** (persistent) | Container default `/app/storage/uploads` |
| `MAX_UPLOAD_MB` | Per-file upload limit | No | Default `25`; keep ≤ nginx `client_max_body_size` (32m) |
| `SMTP_HOST` | SMTP server | **Yes** for email | |
| `SMTP_PORT` | SMTP port | **Yes** for email | `587` for STARTTLS |
| `SMTP_SECURE` | Implicit TLS | No | `false` = STARTTLS on 587; `requireTLS` is enforced in code |
| `SMTP_USER` | SMTP username | **Yes** for email | |
| `SMTP_PASS` | SMTP password / app password | **Yes** for email | **Secret.** Whitespace is stripped (Gmail app-password formatting) |
| `MAIL_FROM_NAME` | From display name | No | |
| `MAIL_FROM_ADDRESS` | From address | **Yes** for email | Must match `SMTP_USER` for Gmail; a startup warning fires if it differs |
| `MAIL_RECIPIENT_POLICY` | `unrestricted` or `allowlist` | No | Default `unrestricted`. Any other value **aborts startup** |
| `MAIL_ALLOWED_DOMAINS` | Permitted recipient domains | Only under `allowlist` | |
| `NOTIFICATION_BLOCKED_DOMAINS` | Domains automated notifications must never email | No | Defaults to demo domains |
| `MAIL_DRY_RUN` | Compose mail without transmitting | No | Default `false`; a dry run reports `skipped`, never `sent` |
| `NOTIFICATIONS_CRON_ENABLED` | Enable the scheduled run | No | Default `true` |
| `NOTIFICATIONS_CRON` | Cron expression (UTC) | No | Default `30 3 * * *` |
| `NOTIFICATIONS_TIMEZONE` | Timezone for date arithmetic | No | Default `Asia/Kolkata` |
| `INVITATION_EXPIRY_DAYS` | Invitation link lifetime | No | Default `7` |
| `OPENAI_API_KEY` | OpenAI credential | **Optional** | **Secret.** Absent ⇒ extraction returns `503`; all other features unaffected |
| `OPENAI_MODEL` | Model name | No | Default `gpt-4o-mini` |
| `OPENAI_BASE_URL` | Alternate endpoint | No | For proxies/Azure |
| `AI_MAX_INPUT_CHARS` | Max PDF characters per request | No | Default `120000` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First admin account | Seed only | **Secret.** Only read by `prisma/seed.ts` |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Demo analyst account | Seed only | **Secret.** Do not seed in production |
| `SEED_ON_START` | Run the seed at container start | No | Read by `docker-entrypoint.sh`, not by TypeScript |
| `K8S_NAMESPACE` | Reserved for deployment | No | Recognised by the loader; **not read by application code** |

### Frontend (build-time only)

| Variable | Purpose | Required | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | API base baked into the bundle | No | Empty ⇒ same-origin `/api` (correct behind nginx). **Requires rebuild to change.** |
| `VITE_API_PROXY_TARGET` | Dev-server proxy target | No | `vite.config.js` only; irrelevant in production |

### Configuration loader behaviour

`backend/src/config/load-env.ts` deviates from stock dotenv deliberately:

- A **non-empty** value in `.env` **overrides** an inherited process variable (stock dotenv does the opposite). A blank entry defers, so container-injected values still work.
- **Duplicate keys** are reported at startup (last assignment wins).
- **Unrecognised** variables are reported with a suggested correct name (e.g. `EMAIL_FROM` → `MAIL_FROM_ADDRESS`).
- Overrides are logged **by name only — never by value**.

---

## 4. Data and operations

### 4.1 Migrations and initial admin

**Migrations.** `npx prisma migrate deploy` applies only pending migrations and never resets. It runs automatically in `docker-entrypoint.sh` before the API starts.

- `prisma migrate dev` and `prisma db push` are **development-only** and must not be run against production.
- Two migrations exist. Both are additive; neither drops data.
- With multiple replicas starting simultaneously, each runs `migrate deploy`. Prisma takes an advisory lock, so this is safe, but running migrations as a **separate pre-deploy job/initContainer** is cleaner.

**Initial admin.** `prisma/seed.ts` creates the admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. It is **idempotent**: it upserts demo rows by fixed UUID and, for an existing user, refreshes the profile but **preserves the existing password**.

For production, two options:
1. Run `npm run seed:users` once with production `SEED_ADMIN_*` values, then change the password through the UI. ⚠️ This also creates the **demo analyst** account — delete it or leave `SEED_USER_*` unset.
2. Insert one admin row directly with an argon2id hash and invite everyone else through the application.

**Do not run the full `npm run seed` in production** — it inserts fictional grants, MoUs, MSAs and SOWs.

### 4.2 Transferring existing data and uploads

Relationships are enforced by **real foreign keys with cascades**, so ordering matters.

- **Database:** `pg_dump -Fc` then `pg_restore` preserves every relationship and constraint. Restore into a database whose schema is at the **same migration version**.
- **Uploads:** copy the whole `UPLOAD_DIR` tree, preserving the shard layout (`<root>/<2-hex>/<sha256>`). File identity is the SHA-256 in `stored_files.storage_path`; **renaming or reorganising files breaks every download link.**
- **Both must move together.** A database restored without its uploads leaves rows whose blobs are missing (downloads return 404 with an explicit message); uploads without the database are unreferenced.

⚠️ **Base44 data has never been imported.** The export contained source code and schema only — no rows, no stored documents. Everything currently in the database is clearly-fictional seed data. See `MIGRATION_STATUS.md` §7. **UNVERIFIED:** no import tooling exists for a Base44 data export, because no such export has been provided.

### 4.3 Backup and restore

| Asset | Method | Notes |
|---|---|---|
| Database | `pg_dump -Fc` (custom format) | Restore with `pg_restore`. Schema must match the migration version. |
| Uploads | Filesystem snapshot or `rsync` of `UPLOAD_DIR` | Content-addressed, so incremental sync is efficient and blobs are immutable. |
| Secrets | Held in the secret store, **never** in the database dump | `.env` is git-ignored |

Database and uploads should be captured **at the same point in time**; a mismatch leaves dangling references in either direction. Restore order: database → uploads → start the application. **UNVERIFIED:** no backup automation exists in this repository — scheduling, retention and off-site copies are entirely a DevOps responsibility.

### 4.4 Scheduled notifications and multiple instances

**Control:** `NOTIFICATIONS_CRON_ENABLED` (currently **`false`**), `NOTIFICATIONS_CRON` (UTC cron), `NOTIFICATIONS_TIMEZONE`. There is also a manual admin endpoint `POST /api/notifications/run`, which accepts `{"dry_run": true}`.

**Multi-instance behaviour — this matters:**

- The cron is **in-process**. With *N* replicas and the cron enabled, **all *N* will fire**, because the `running` flag is per-process.
- Duplicate *sends* are nevertheless prevented by a **database unique index**, not by application logic:
  `@@unique([rule_id, item_id, recipient_email, scheduled_for_date, is_test])` (`schema.prisma:1087`).
  Each instance claims a slot by inserting a log row first; losers get a constraint violation and skip. A duplicate email is therefore **structurally impossible**, even under a race.
- Residual cost: *N* instances each perform the full rule evaluation and query pass — wasteful, not incorrect.

**Recommended:** enable the cron on exactly one replica (a dedicated deployment with `NOTIFICATIONS_CRON_ENABLED=true`, all others `false`), or disable it everywhere and drive `POST /api/notifications/run` from an external scheduler (Kubernetes CronJob). The unique index remains the backstop either way.

### 4.5 Known blockers and gaps

| # | Issue | Impact | Where |
|---|---|---|---|
| 1 | **`APP_PUBLIC_URL` defaults to `http://localhost:5173`** | Invitation and password links are unusable by anyone on another machine. The backend logs a startup warning when real SMTP is paired with a localhost URL. | `configuration.ts:170` |
| 2 | **`CORS_ORIGINS` defaults to localhost** | Browser calls fail from a real hostname until set. | `configuration.ts:169` |
| 3 | **JWT secrets ship as `dev-only-…` placeholders in `.env.example`** | Mitigated: the process **refuses to boot** in production with them. Must be generated per environment. | `main.ts:34-44` |
| 4 | **Uploads on local disk** | Blocks naive horizontal scaling; needs RWX volume, single replica, or an S3 adapter (not written). | `files.service.ts` |
| 5 | **In-process cron** | Fires on every replica; see §4.4. | `notifications.service.ts:54` |
| 6 | **`VITE_API_BASE_URL` is build-time** | Cannot be changed by environment variable at deploy time; needs a rebuild. | `frontend/Dockerfile` |
| 7 | **No `engines` / `.nvmrc`** | Node version is implied only by the Docker image; local dev is on 24, images on 22. | repo-wide |
| 8 | **17 unused frontend + 3 unused backend dependencies** | Image size and audit noise, including `three`, `@stripe/*`, `react-leaflet`. No runtime effect. | §1 |
| 9 | **No object storage, queue, or cache** | Architectural constraint to be aware of, not a defect. | — |
| 10 | **Multer advisory** | `@nestjs/platform-express@10` pins multer 1.x internally. Not reachable through our routes; resolving it means upgrading to NestJS 11. | lockfile |

**Base44 / Mailpit status — resolved:**
- **No `@base44` package** in either manifest or `node_modules`.
- **No Base44 network call** anywhere in shipped source.
- **Zero `base44` occurrences in the built frontend bundle** (`frontend/dist`).
- Remaining mentions are source comments documenting what each component replaced, plus one error string, a Swagger description, a `base44: { sdk_present: false }` health field and test names.
- **No Mailpit service** in Compose. The only references are two hostname literals in `isLocalCapture()` (`mailer.service.ts:135-136`), which decide whether to apply the recipient allow-list — inert with a real SMTP host. The `grantos-mailpit` **volume** was deliberately left on disk and can be removed with `docker volume rm grantos-mailpit`.

**Does production Docker/Compose already exist?** Yes — both Dockerfiles are multi-stage and production-shaped (non-root user, dev-dependency pruning, `tini`, healthchecks). `docker-compose.yml` runs the full stack under `--profile app`. It is written for a **single host**: it uses `container_name`, host port bindings and local named volumes. It is a sound reference for a Kubernetes manifest, not a substitute for one. **No Kubernetes manifests, Helm charts or CI/CD pipelines exist in this repository.**

### 4.6 Preliminary sizing estimates

⚠️ **Estimates, not measurements.** No load testing has been performed. Assumptions: ~20–50 internal users, a few hundred grants/agreements, PDFs of 1–10 MB, occasional AI extraction.

| Component | CPU | RAM | Storage | Assumptions |
|---|---|---|---|---|
| Backend | 0.5–1 vCPU | 512 MB–1 GB | — | Node heap; PDF parsing is the spike. AI calls are I/O-bound. |
| Frontend (nginx) | 0.1–0.25 vCPU | 64–128 MB | — | Static assets; bundle ~1.1 MB raw / ~300 KB gzipped. |
| PostgreSQL | 0.5–1 vCPU | 1–2 GB | 20 GB to start | Currently ~10 MB with demo data. Growth is dominated by audit and notification logs. |
| Upload volume | — | — | 50–100 GB to start | Entirely dependent on document volume; SHA-256 de-duplication helps. **UNVERIFIED** — no real-world document volume figures were available. |

Validate under realistic load before committing to these.

---

## 5. DevOps summary

> **GrantOS — deployment brief**
>
> **Stack.** React 18 + Vite 6 SPA (built to static assets, served by nginx 1.27-alpine which also reverse-proxies `/api`). NestJS 10 on Node 22 (Express underneath), TypeScript, Prisma 5 against PostgreSQL 16. JWT auth with argon2id hashing. Email via SMTP (nodemailer). Optional OpenAI for document extraction. npm, lockfileVersion 3.
>
> **Infrastructure required.** PostgreSQL 16 (no extensions). One persistent **RWX** volume for uploads — files live on the filesystem, content-addressed by SHA-256, with only metadata in the database. No Redis, no queue, no cache, no separate worker.
>
> **External connectivity.** Outbound SMTP (587/STARTTLS) and, if AI extraction is wanted, outbound HTTPS to `api.openai.com`. Inbound HTTPS to the frontend only; the backend need not be publicly exposed if nginx proxies it.
>
> **Ready to use.** Production-shaped multi-stage Dockerfiles for both services (non-root, pruned dev deps, `tini`, healthchecks). Health endpoints at `/api/health/live`, `/api/health/ready`, `/api/health`. Migrations apply automatically at container start via `prisma migrate deploy`. The service refuses to boot in production with placeholder JWT secrets.
>
> **Not present.** No Kubernetes manifests, Helm charts, CI/CD pipelines or backup automation. The Compose file is single-host (fixed container names, host port bindings) — a reference, not a deployment artefact.
>
> **Decisions needed from us:**
> 1. **Uploads at scale** — shared RWX volume, pin the backend to one replica, or fund an S3 adapter (code change).
> 2. **Scheduler ownership** — enable the in-process cron on exactly one replica, or disable it and drive `POST /api/notifications/run` from a Kubernetes CronJob. Duplicate sends are already prevented by a database unique constraint either way.
> 3. **`APP_PUBLIC_URL` and `CORS_ORIGINS`** — both default to `localhost`; invitation links do not work until a real hostname is set.
> 4. **`VITE_API_BASE_URL` is baked at build time** — per-environment frontend images, or rely on same-origin `/api` through nginx (recommended).
> 5. **Node version** — standardise on 22 to match the images; nothing in the repo pins it today.
> 6. **Secrets management** — JWT pair, SMTP password, OpenAI key. None are in git; all need a secret store.
> 7. **First admin** — seed once with production credentials, or insert one admin row and invite the rest.
>
> **Data note.** No client data has ever been migrated from Base44 — the export contained source code and schema only. Everything in the database today is fictional seed data.
>
> **Sizing.** Preliminary only, untested: backend 0.5–1 vCPU / 512 MB–1 GB; nginx 0.1–0.25 vCPU / 64–128 MB; PostgreSQL 0.5–1 vCPU / 1–2 GB / 20 GB; uploads 50–100 GB to start.

---

## Appendix — verification method

| Claim | How it was verified |
|---|---|
| Declared vs resolved versions | `package.json` + `package-lock.json` (`lockfileVersion 3`), parsed with Node |
| Unused dependencies | Regex for genuine `import`/`require` across 182 frontend files and all backend `.ts`; prose/comment matches excluded; `unpdf` confirmed as a **dynamic** ESM import |
| Node version | Docker base images; absence of `engines`/`.nvmrc` confirmed by filesystem search |
| Ports, volumes, healthchecks | `docker-compose.yml`, both Dockerfiles, `nginx.conf` |
| Environment variables | Regex over all backend `.ts` for `process.env.*`; `DATABASE_URL` traced to `schema.prisma`; `VITE_*` traced separately |
| Schema scale | Counted `model`/`enum`/`@relation` in `schema.prisma`; cross-checked against `information_schema.tables` (29 tables) |
| Storage model | `files.service.ts` (write path, sharding, SHA-256) and the `StoredFile` model |
| Cron and dedup | `@Cron` decorator and the `notification_dedup` unique index |
| Base44/Mailpit residue | Source scan classifying comment vs code; `node_modules` check; scan of built `dist` |
| Database/upload size | Read-only `pg_database_size` query; directory listing |

**Not executed:** no migrations, seeds, emails, AI calls, writes or configuration changes. The working tree was clean before this assessment and only this document was added.
