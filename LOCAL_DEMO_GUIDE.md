# GrantOS — Local Demo Guide

Everything here was run and verified on **Windows 11 / PowerShell 5.1 / Node 24.14 / Docker 29.2**.
Commands are PowerShell.

---

## 1. Prerequisites

| Tool | Needed | Check |
|---|---|---|
| Node.js 20+ | yes | `node -v` |
| npm 10+ | yes | `npm -v` |
| Docker Desktop (running) | yes | `docker info` |
| OpenAI API key | optional | only for AI document extraction |

**Ports used.** These are deliberately non-default so the stack does not collide with anything already running:

| Port | Service |
|---|---|
| 5173 | Frontend (Vite) |
| 3001 | Backend API |
| 55432 | PostgreSQL *(not 5432 — that was already in use)* |
| 8025 | Mailpit web UI |
| 1025 | Mailpit SMTP |

Check they are free:

```powershell
foreach ($p in 3001,5173,55432,8025,1025) {
  $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  "{0,-6} {1}" -f $p, $(if ($busy) { 'IN USE' } else { 'free' })
}
```

---

## 2. First-time setup

From the repository root (`C:\Users\sruz\Project\venu\GrantOS\GrantOSBase44`):

```powershell
# 1. Start PostgreSQL and the local mail catcher
docker compose up -d

# 2. Backend: dependencies, environment, schema, demo data
cd backend
npm install
Copy-Item .env.example .env        # safe: does nothing if you already have one
npx prisma generate
npx prisma migrate deploy
npm run seed

# 3. Frontend dependencies
cd ..\frontend
npm install
cd ..
```

`npm run seed` is **safe to re-run**: demo rows use fixed IDs and are upserted, so it never
duplicates data and never touches records you created yourself.

---

## 3. Starting the app

Two terminals, from the repository root:

```powershell
# Terminal 1 — API
cd backend
npm run start:dev
```

```powershell
# Terminal 2 — UI
cd frontend
npm run dev
```

**Open → <http://localhost:5173>**

| What | Where |
|---|---|
| Application | <http://localhost:5173> |
| API health | <http://localhost:3001/api/health> |
| API docs (Swagger) | <http://localhost:3001/api/docs> |
| **Mailpit — all outgoing email** | <http://localhost:8025> |

### Demo credentials

Created by `npm run seed`, configurable in `backend/.env`:

| Role | Email | Password | Can see |
|---|---|---|---|
| **Administrator** | `admin@grantos.local` | `DemoAdmin!2026` | Everything; the only role that can edit |
| **Analyst** (restricted) | `analyst@grantos.local` | `DemoUser!2026` | Grants + MoUs only; read-only |

The analyst account is deliberately restricted — it demonstrates module-level and role-level access control.
Signing in as the analyst and opening **SOWs** or **Users** shows the backend refusing the request.

> These are demo credentials for a local instance. Change them in `backend/.env` and re-seed before
> this is reachable by anyone else.

### Stopping, restarting, resetting

```powershell
# Stop the app          : Ctrl+C in both terminals
docker compose stop                  # stop database + mail, keep all data
docker compose start                 # bring them back
docker compose down                  # remove containers, KEEP data (volumes survive)
docker compose down -v               # DESTROYS the database and uploads — asks for nothing, so be sure
```

Data lives in the named volumes `grantos-pgdata` (database) and `grantos-uploads` (documents).
A normal `down` keeps both — verified by `scripts/verify/persistence.ps1`.

### Everything in containers instead

```powershell
docker compose --profile app up -d --build
docker compose exec backend npx prisma db seed
# UI on http://localhost:5173, API on http://localhost:3001
```

---

## 4. What email does during the demo

**No email leaves this machine.** The backend is pointed at Mailpit, a local SMTP sink, and every
message — digests, invitations, test sends — is captured at <http://localhost:8025>.

There is also a second safety net: `MAIL_ALLOWED_DOMAINS` in `backend/.env` restricts recipients to
`grantos.local`, `example.com` and `example.org`. Even if SMTP were repointed at a real relay with demo
data loaded, mail to any other domain is refused rather than sent.

Trigger a notification run on demand:

```powershell
$t = (Invoke-RestMethod http://127.0.0.1:3001/api/auth/login -Method Post -ContentType 'application/json' `
      -Body '{"email":"admin@grantos.local","password":"DemoAdmin!2026"}').access_token
Invoke-RestMethod http://127.0.0.1:3001/api/notifications/run -Method Post `
  -Headers @{Authorization="Bearer $t"} -ContentType 'application/json' -Body '{}'
```

Run it twice: the second run reports `skipped` and sends nothing. Duplicate suppression is enforced by a
database constraint, not by application logic, so concurrent runs cannot double-send.

The scheduled job runs daily at **03:30 UTC (09:00 Asia/Kolkata)** — the same time Base44 used.

---

## 5. Five-minute client walkthrough

> Reset to a clean demo state first if needed: `cd backend; npm run seed`

**0:00 — Sign in** · <http://localhost:5173> as `admin@grantos.local`.
Mention: this is a real session against your own database — no external platform is involved.

**0:30 — Dashboard.** Portfolio totals, action-required feed, upcoming and overdue items. Every figure is
computed from the records in PostgreSQL.

**1:00 — Open "Digital Identity Foundations Programme"** (Grants → the $1.25M grant). Walk the tabs:
*Overview, Contacts (3), Milestones (4 — one overdue), Deliverables, Tranches, Reporting, Timeline, Health Score.*
This is the depth of the data model: one grant with contacts, milestones, deliverables, payment tranches and
reporting obligations all linked to it.

**2:00 — Edit something.** Change a milestone status or add a contact. Save, reload the page — it persisted.

**2:45 — Documents.** Upload a PDF against the grant, then open it with the link. The document is served from
your own storage by an authorised endpoint; signed-out users get a 401, and a user without access to that module
is refused.

**3:30 — Agreements.** MoUs, MSAs and SOWs, with an MSA's key clauses and a SOW linked back to its parent grant
and MSA. Same model, different instrument.

**4:00 — Notifications.** Settings → notification rules and recipients. Trigger a run (command above), then show
the captured digest in Mailpit at <http://localhost:8025>. Point out the "you are receiving this because…"
footer — recipients come from the record's own contacts.

**4:30 — Access control.** Sign out, sign in as `analyst@grantos.local`. SOWs and Users are not reachable; grants
are read-only. The rules are enforced in the backend, not hidden in the UI.

**5:00 — Close.** Reports and Audit Trail. Mention the application now runs entirely on infrastructure you
control, and the same compose file deploys to Kubernetes with a configurable namespace.

### If something looks wrong mid-demo

Reload the page first. If the API is the problem, `http://localhost:3001/api/health` tells you which dependency
is unhappy. Re-running `npm run seed` restores demo records without deleting anything you added.

---

## 6. Verifying AI document extraction

Extraction is **optional**. Without a key the whole application works; only extraction endpoints return an
explicit `503 ai_not_configured`. They never invent results.

```powershell
# Is it configured?
$t = (Invoke-RestMethod http://127.0.0.1:3001/api/auth/login -Method Post -ContentType 'application/json' `
      -Body '{"email":"admin@grantos.local","password":"DemoAdmin!2026"}').access_token
Invoke-RestMethod http://127.0.0.1:3001/api/ai/status -Headers @{Authorization="Bearer $t"}
```

> **⚠️ Note for this machine.** An `OPENAI_API_KEY` is set in your Windows *user* environment, so the backend picks
> it up and `/api/ai/status` reports `enabled: true` — but **OpenAI rejects it**: a real extraction run returned
> `401 Incorrect API key provided`. The key is expired, revoked, or mistyped. Until it is replaced, extraction
> will fail with a clear "credentials rejected" message. Everything else in the app is unaffected.
>
> To fix: put a working key in `backend/.env` **and** clear the stale one from your environment
> (`[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $null, 'User')`, then open a new terminal) — an empty
> value in `.env` does **not** override an inherited variable, because dotenv never overwrites an existing
> process variable.
>
> To disable AI cleanly for a demo instead: `$env:OPENAI_API_KEY=''` in the terminal before `npm run start:dev`.
> Extraction then reports `503 ai_not_configured`, which is the honest "not set up" state.

To test extraction end to end, upload a **text-layer** PDF to a grant in the UI and use *Extract from PDF*.
Expect: deliverables and milestones proposed for review before anything is saved.

Behaviour you can rely on:

- **Text-layer PDFs** — parsed locally with `unpdf`, then sent to the model as text.
- **Scanned / image-only PDFs** — rejected with a plain message saying there is no text layer and that OCR is not
  configured. Nothing is fabricated and nothing is saved.
- **Zero results** — reported as "extraction ran but matched nothing", never as a silent success.
- **No key** — `503` naming the missing configuration; all other features keep working.

The API key is read only by the backend and is never sent to the browser.

---

## 7. Troubleshooting

**"Cannot reach the GrantOS API" on the login screen**
The backend is not running or not on 3001. Check `http://localhost:3001/api/health`.

**Login returns 401 with correct credentials**
The database may not be seeded: `cd backend; npm run seed`.

**`Environment variable not found: DATABASE_URL`**
`backend/.env` is missing: `Copy-Item .env.example .env`.

**Backend starts but the database is unreachable**
`docker compose ps` — `grantos-postgres` should be `healthy`. If not: `docker compose logs postgres`.

**Port already in use**
Override in `.env` / `docker-compose.yml`: `PORT`, `POSTGRES_HOST_PORT`, `FRONTEND_HOST_PORT`.
Find the offender with `Get-NetTCPConnection -LocalPort <port> -State Listen`.

**`nest build` prints nothing and `dist/main.js` is missing**
Stale incremental cache: `Remove-Item backend\dist -Recurse -Force; Remove-Item backend\tsconfig.tsbuildinfo -Force -EA SilentlyContinue`, then rebuild.

**Documents open as a blank tab or 401**
You are signed out. Sign in again — the download link relies on the session cookie set at login.

**No email in Mailpit**
Confirm `grantos-mailpit` is running (`docker compose ps`), then check
`http://localhost:3001/api/notifications/status` for SMTP reachability. Remember a second run of the same day
legitimately sends nothing.

**Uploads rejected with 403**
Only admins and users with `can_upload_pdf` may upload. Enable it on the Users page.

---

## 8. Re-running the verification suite

```powershell
cd backend; npx jest                            # 70 unit tests
cd ..
powershell -File scripts\verify\api-smoke.ps1       # 35 API checks
powershell -File scripts\verify\end-to-end.ps1      # 43 checks through the SPA origin
powershell -File scripts\verify\persistence.ps1     # 14 checks: restart, data survives
powershell -File scripts\verify\clean-database.ps1  # 15 checks: fresh install, isolated DB
```

`end-to-end.ps1` needs PDF fixtures once: `cd backend; node test\make-fixtures.js $env:TEMP`.

`clean-database.ps1` creates and drops a throwaway database (`grantos_cleanstart`) and never touches
your primary `grantos` database.

All five scripts create their own records and clean up after themselves.

---

## 9. Deploying later (not required for the demo)

The images build from `backend/Dockerfile` and `frontend/Dockerfile` and are plain containers, so the same
artefacts deploy to Kubernetes. Everything environment-specific is already an environment variable
(`DATABASE_URL`, `JWT_*`, `SMTP_*`, `OPENAI_API_KEY`, `APP_PUBLIC_URL`), and `K8S_NAMESPACE` is reserved in
`.env.example` for a configurable namespace.

Before anything leaves your machine:

1. Replace both `JWT_*` secrets — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
2. Change the seeded account passwords.
3. Point `SMTP_*` at a real relay and review `MAIL_ALLOWED_DOMAINS`.
4. Serve over HTTPS so the session cookie is issued with `Secure` (automatic when `NODE_ENV=production`).
5. Back the uploads volume with real storage.

No deployment has been performed, and no secret is committed to this repository.
