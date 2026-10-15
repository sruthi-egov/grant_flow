# GrantOS

Management of grants, MoUs, MSAs and SOWs — contacts, milestones, deliverables, payment tranches,
reporting obligations, document intelligence, notifications and audit history.

Originally built on Base44. This repository is the **standalone application**: it runs entirely on
infrastructure you control and has no dependency on Base44 services, SDKs or credentials.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, Tailwind, Radix UI |
| Backend | Node.js, NestJS 10, TypeScript |
| Database | PostgreSQL 16 via Prisma 5 |
| Auth | JWT (argon2id passwords, rotating refresh tokens) |
| Files | Local content-addressed storage, authorised download |
| Email | SMTP via nodemailer — Mailpit locally, so nothing is delivered |
| AI | OpenAI, called **only** from the backend; optional |
| Local stack | Docker Compose |

## Quick start

```powershell
docker compose up -d                                   # PostgreSQL + Mailpit
cd backend;  npm install; Copy-Item .env.example .env
npx prisma migrate deploy; npm run seed; npm run start:dev
# in a second terminal:
cd frontend; npm install; npm run dev
```

Open **<http://localhost:5173>** and sign in with `admin@grantos.local` / `DemoAdmin!2026`.

Full instructions, demo credentials, a five-minute walkthrough and troubleshooting:
**[LOCAL_DEMO_GUIDE.md](LOCAL_DEMO_GUIDE.md)**

Migration record, verification results and known limitations:
**[MIGRATION_STATUS.md](MIGRATION_STATUS.md)**

## Layout

```
backend/                 NestJS API
  prisma/                schema, migrations, demo seed
  src/
    auth/                login, JWT, password changes
    entities/            generic CRUD for all 25 entities + access rules
    files/               upload, authorised download
    ai/                  PDF text extraction and model calls
    notifications/       rules engine, digest email, daily cron
    admin/               database reset, file cleanup
    health/              liveness and readiness
frontend/                React SPA
  src/api/apiClient.ts   the single place the UI talks to the API
docs/base44-legacy-reference/
                         the original Base44 export, kept for reference
scripts/verify/          end-to-end verification scripts
```

## Tests

```powershell
cd backend; npx jest                            # 70 unit tests
powershell -File scripts\verify\end-to-end.ps1  # 43 checks against a running stack
```

See [MIGRATION_STATUS.md §5](MIGRATION_STATUS.md) for the full verification record.

## Data

The database ships with **clearly fictional demo data** — invented organisations, people and amounts, all on
`@grantos.local` addresses. It is not client data. The Base44 export contained source code and schema only,
so no production records or stored documents came across with it; importing those requires a separate data
export from Base44 (see [MIGRATION_STATUS.md §7](MIGRATION_STATUS.md)).

## Configuration

All configuration is environment variables; see `backend/.env.example` for the documented list.
`.env` files are git-ignored and no secret is committed to this repository.
