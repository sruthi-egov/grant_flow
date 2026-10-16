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

## 4. Email delivery

Mail is sent through a **real SMTP provider** configured in `backend/.env`.
There is no mail container in `docker-compose.yml` any more.

| Variable | Purpose |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` — selects **STARTTLS** on 587. It does *not* mean unencrypted: the backend sets `requireTLS`, so a server that refuses the upgrade is rejected rather than sent to in clear text. |
| `SMTP_USER` | the **full Gmail address** that authenticates |
| `SMTP_PASS` | the 16-character **App Password** (2-Step Verification required; a normal password is rejected). Google's display spaces are stripped automatically. |
| `MAIL_FROM_NAME` | display name on the From header |
| `MAIL_FROM_ADDRESS` | **must equal `SMTP_USER`** unless you have a verified alias — Gmail rewrites or rejects anything else. The backend warns at startup if they differ. |
| `MAIL_ALLOWED_DOMAINS` | recipient allow-list, enforced for real delivery |
| `MAIL_DRY_RUN` | compose but never transmit. A dry run reports `skipped`, never `sent`. |

Check the live state at any time:

```powershell
$t = (Invoke-RestMethod http://localhost:5173/api/auth/login -Method Post -ContentType 'application/json' `
      -Body '{"email":"admin@grantos.local","password":"DemoAdmin!2026"}').access_token
Invoke-RestMethod http://localhost:5173/api/notifications/status -Headers @{Authorization="Bearer $t"}
```

`mode` is `real_delivery`, `local_capture` or `dry_run`, and `reachable` reports
whether SMTP authentication actually succeeded.

### ⚠️ The notification cron will email the demo contacts

`NOTIFICATIONS_CRON_ENABLED=true` runs the daily pass at 03:30 UTC. The seeded
demo records contain fictional `@grantos.local` contacts on a domain that does
not resolve. With real SMTP configured, each run attempts delivery to those
addresses and every one bounces, which harms the sending account's reputation.

Before leaving a real provider configured overnight, do one of:

- set `NOTIFICATIONS_CRON_ENABLED=false`, or
- set `MAIL_DRY_RUN=true`, or
- remove `grantos.local` from `MAIL_ALLOWED_DOMAINS` so those sends are refused, or
- replace the seeded contacts with real addresses.

### Running a local capture tool instead (optional)

Nothing in the application requires one, but for development you can start one
and point SMTP at it — no code change needed:

```powershell
docker run -d --name mailpit -p 8025:8025 -p 1025:1025 axllent/mailpit
# then in backend/.env:  SMTP_HOST=localhost  SMTP_PORT=1025  SMTP_USER=  SMTP_PASS=
```

While SMTP points at a local capture tool the recipient allow-list is not
applied, because nothing can leave the machine.

### Triggering a notification run on demand

```powershell
$t = (Invoke-RestMethod http://127.0.0.1:3001/api/auth/login -Method Post -ContentType 'application/json' `
      -Body '{"email":"admin@grantos.local","password":"DemoAdmin!2026"}').access_token
# Add "dry_run": true to evaluate the rules without sending anything.
Invoke-RestMethod http://127.0.0.1:3001/api/notifications/run -Method Post `
  -Headers @{Authorization="Bearer $t"} -ContentType 'application/json' -Body '{"dry_run":true}'
```

Run it twice without `dry_run`: the second run reports `skipped` and sends nothing. Duplicate suppression
is enforced by a database constraint, not by application logic, so concurrent runs cannot double-send.

**With a real provider configured, prefer `dry_run` for any ad-hoc testing** — a
live run emails every matching record contact.

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

### Where the key goes

Put it in **`backend/.env`**, variable **`OPENAI_API_KEY`**:

```
OPENAI_API_KEY=sk-proj-...
```

Then restart the backend. **A non-empty value in `.env` now wins over any stale
`OPENAI_API_KEY` left in your Windows user environment** — the backend loads the
file with file-wins precedence and logs, by name, which variables it overrode.
Leaving the `.env` entry blank still defers to the inherited value, so
container-injected configuration keeps working; the startup log says so
explicitly when that happens.

To clear a stale machine-level key entirely:

```powershell
[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $null, 'User')
# then open a NEW terminal - the current one keeps the old value
```

**Watch for a mis-copied key.** A trailing full stop picked up from the end of a
sentence, wrapping quotes, or a stray space are invisible in a 160-character
string and produce an opaque `401` from OpenAI. The backend now checks the
format at startup and reports the specific problem in the log and in
`/api/ai/status` (`key_format_warning`) rather than letting you guess.

To disable AI cleanly for a demo: set `OPENAI_API_KEY=` empty in `.env` *and*
clear it from your environment. Extraction then reports `503 ai_not_configured`,
the honest "not set up" state.

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

## 6a. Inviting users

An invitation creates **no account**. It stores a pending record and emails a
**single-use link**; the account is created only when the recipient opens that
link and chooses their own password. The role and module access you select are
attached to the invitation and applied on acceptance — the recipient cannot
change them.

**To invite someone:** Users → *Invite User* → enter the email, pick the role and
modules → *Send*. They appear under **Pending invitations** until they accept.

From that panel you can **Resend** (issues a new link and kills the old one) or
**Cancel** (revokes the link immediately).

| Situation | What happens |
|---|---|
| Invite an address that already has an account | Refused with an explanation. No duplicate is created. |
| Invite someone who already has a pending invitation | A new link is issued and the previous one stops working. |
| Recipient opens a used link | "This invitation has already been used." |
| Recipient opens an expired link | "This invitation has expired." Resend to issue a new one. |
| Admin cancels before acceptance | Link stops working immediately. |

Links expire after `INVITATION_EXPIRY_DAYS` (default 7) and can be used once.

> **During the demo, invitation emails go to Mailpit** at <http://localhost:8025>,
> like every other message. Open the message there and click the link to walk
> through acceptance. While SMTP points at Mailpit you can invite **any**
> address — including real ones — because nothing can leave this machine.
> The `MAIL_ALLOWED_DOMAINS` restriction applies only once real delivery is
> configured.

### Sending a real invitation to a real person

Two things must change first, and **both** matter:

**1. Real SMTP** — replace these five values in `backend/.env`:

```
SMTP_HOST=            # e.g. smtp.office365.com, smtp.gmail.com, smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false     # true only for implicit TLS on port 465
SMTP_USER=            # provider username
SMTP_PASS=            # provider password / API key / app password
MAIL_FROM_ADDRESS=    # an address on a domain your provider is allowed to send for
```

`backend/.env.example` has a table of the exact values for Microsoft 365, Google
Workspace, Amazon SES, SendGrid and Mailgun. Google needs an **App Password**
(2-Step Verification enabled); a normal account password is rejected.

**2. Allow the recipient's domain.** Once real SMTP is configured, mail to any
domain not in `MAIL_ALLOWED_DOMAINS` is **refused, not sent** — the guard that
stops demo data from emailing real people:

```
MAIL_ALLOWED_DOMAINS=grantos.local,example.com,example.org,theirdomain.org
```

This restriction is **not** applied while SMTP points at Mailpit, because
nothing can escape a local capture tool. A refusal is reported as an error
naming the domain and the fix — never a silent no-op.

**3. Make the link reachable.** `APP_PUBLIC_URL=http://localhost:5173` only
resolves on *your* machine. A recipient elsewhere receives a link that goes
nowhere. Set it to something they can open:

| Situation | `APP_PUBLIC_URL` | Notes |
|---|---|---|
| Same machine | `http://localhost:5173` | the default; fine for the demo |
| Same office network | `http://<your-LAN-IP>:5173` | find it with `ipconfig`; the Vite server already listens on all interfaces, but your firewall must allow inbound 5173 |
| Anywhere else | a tunnel or deployed hostname | e.g. `cloudflared`/`ngrok`, or a real deployment |

Restart the backend after changing any of these. It logs a warning at startup,
and `/api/notifications/status` reports `links_reachable_externally: false`, if
real SMTP is configured while the URL is still localhost.

> I have not exposed this application to any network, and no real invitation has
> been sent. Tell me the recipient address when you want one sent, and I will
> confirm the configuration first.

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
cd backend; npx jest                            # 102 unit tests
cd ..
powershell -File scripts\verify\api-smoke.ps1       # 35 API checks
powershell -File scripts\verify\end-to-end.ps1      # 43 checks through the SPA origin
powershell -File scripts\verify\invitations.ps1     # 52 checks: full invitation workflow
powershell -File scripts\verify\persistence.ps1     # 14 checks: restart, data survives
powershell -File scripts\verify\clean-database.ps1  # 15 checks: fresh install, isolated DB
```

`end-to-end.ps1` needs PDF fixtures once: `cd backend; node test\make-fixtures.js $env:TEMP`.

`clean-database.ps1` creates and drops a throwaway database (`grantos_cleanstart`) and never touches
your primary `grantos` database.

All five scripts create their own records and clean up after themselves.

---

## 8a. Manual browser verification of invitations

Browser automation was **not available** in the session that built this — the
`chrome-devtools` MCP server failed to connect. Everything below was verified
over HTTP, which confirms the API and routing but **not** that the UI renders.
These steps close that gap. They take about five minutes.

Use a **second browser profile or a private window** for the invitee so you are
not signed in as the admin.

**A. Send the invitation**
1. Sign in at <http://localhost:5173> as `admin@grantos.local`.
2. Users → **Invite User**. Email `newcolleague@grantos.local`, role **user**,
   tick **Grants** and **MOUs** only, leave PDF upload off. Send.
3. ✅ A success toast appears and the dialog closes.
4. ✅ A **Pending invitations** panel shows the address, role, and expiry date.
5. ✅ The Users list does **not** yet contain that address.

**B. Check the email**
6. Open <http://localhost:8025>. ✅ A message "You have been invited to GrantOS".
7. ✅ It contains an **Accept your invitation** button, **no password**, and says
   the link can only be used once.

**C. Accept it (private window)**
8. Copy the link, open it in a **private window**.
9. ✅ The page shows the email, role **user**, who invited them, and the expiry.
10. Try a weak password like `password`. ✅ Rejected with the rule explained.
11. Enter `NewColleague!2026` twice and submit.
12. ✅ "Account created", then a redirect to the sign-in page.

**D. Sign in as the new user**
13. Sign in with `newcolleague@grantos.local` / `NewColleague!2026`.
14. ✅ You land on the dashboard.
15. ✅ The sidebar shows **Grants** and **MOUs** but **not** SOWs, MSAs or Users.
16. ✅ Opening a grant is read-only — no Save on edit forms.

**E. Single use**
17. Back in the private window, reload the invitation link.
18. ✅ "This invitation has already been used."

**F. Resend and cancel**
19. As admin, invite `another@grantos.local`. In **Pending invitations** click
    **Resend**. ✅ Toast says the previous link no longer works.
20. ✅ Mailpit shows a second email with a *different* link.
21. Open the **first** link. ✅ "This invitation is no longer valid."
22. Click **Cancel** on that invitation. ✅ It disappears from the panel.
23. Open the **second** link. ✅ Also rejected.

**G. Expired link** (optional — needs a database command)
```powershell
docker exec grantos-postgres psql -U grantos -d grantos `
  -c "UPDATE invitations SET expires_at = now() - interval '1 day' WHERE accepted_at IS NULL"
```
24. Open any pending link. ✅ "This invitation has expired."

**H. Console and network**
25. With DevTools open (F12) during the above: ✅ no uncaught errors in Console,
    and ✅ no request to any `base44` host in Network.

**Clean up afterwards**
```powershell
# removes the demo invitees, leaves seeded accounts untouched
docker exec grantos-postgres psql -U grantos -d grantos `
  -c "DELETE FROM users WHERE email IN ('newcolleague@grantos.local','another@grantos.local')"
docker exec grantos-postgres psql -U grantos -d grantos `
  -c "DELETE FROM invitations WHERE email IN ('newcolleague@grantos.local','another@grantos.local')"
```

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
