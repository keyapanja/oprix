# Operix

A multi-tenant **business-operations platform** for service businesses — HR,
attendance, leave, projects & tasks, time tracking, clients + a client portal,
payroll, knowledge base, and reporting — in one app. Built on **Next.js 16**
(App Router) + **Prisma** + **PostgreSQL** (Supabase).

## Documentation
- **[docs/STATUS.md](docs/STATUS.md)** — current build state: what's live, conventions, what's pending. *Read this first.*
- **[docs/REFERENCE.md](docs/REFERENCE.md)** — local setup, architecture & foundations, build roadmap, and the companion-extension design (one consolidated reference).
- **[extension/README.md](extension/README.md)** — load & use the companion browser extension.
- **[CLAUDE.md](CLAUDE.md)** / **[AGENTS.md](AGENTS.md)** — instructions for AI coding agents working in this repo.

## Quick start
Full steps (Supabase, env, gotchas) are in **[docs/REFERENCE.md § Local setup](docs/REFERENCE.md#1-local-setup)**. TL;DR:

```powershell
npm install
# Copy .env.example → .env, fill DATABASE_URL / DIRECT_URL / AUTH_SECRET
npm run db:push        # create/update tables from prisma/schema.prisma
npm run dev            # http://localhost:3000
```

> Against a **shared/production** database use `db:push` only — **never**
> `db:seed`. Seeding is for a fresh, empty, local DB.
