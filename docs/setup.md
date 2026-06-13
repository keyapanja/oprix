# Operix — Local Setup

Prerequisites: Node 22+, npm 10+ (already verified). Database: Supabase (free).

## 1. Create the Supabase database
1. Go to [supabase.com](https://supabase.com) → sign in → **New project**.
2. Name it `operix`, set a strong **database password** (save it), pick a region near you.
3. Wait ~2 min for it to provision.
4. **Project Settings → Database → Connection string**. You need two URLs:
   - **Transaction pooler** (port `6543`) → goes in `DATABASE_URL`
   - **Session / direct** (port `5432`) → goes in `DIRECT_URL`
   - Replace `[YOUR-PASSWORD]` in each with the password from step 2.

## 2. Configure environment
1. Copy `.env.example` to `.env`.
2. Paste the two connection strings into `DATABASE_URL` and `DIRECT_URL`.
3. Generate `AUTH_SECRET`:
   ```powershell
   # PowerShell
   [Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Max 256}))
   ```
   Paste the result into `AUTH_SECRET`.

## 3. Create the database schema
```powershell
npm run db:generate      # generate the Prisma client
npm run db:migrate        # create tables from prisma/schema.prisma
npm run db:seed           # demo company + Super Admin
```

Seed creates a login:
- **admin@operix.test** / **ChangeMe123!**  (change after first login)

## 4. Run the app
```powershell
npm run dev
```
Open http://localhost:3000.

## Connection-string gotchas (Supabase)
Two things that will silently break the connection:
1. **URL-encode special characters in the password.** A password like `Go@1$` must become
   `Go%401%24` inside the connection string (`@`→`%40`, `$`→`%24`, `:`→`%3A`, `/`→`%2F`).
   An un-encoded `@` collides with the `@` that separates credentials from the host.
2. **Don't use the direct `db.<ref>.supabase.co` host for migrations** — Supabase serves it
   IPv6-only, which usually fails from a normal network. Use the **session pooler**
   (`<region>.pooler.supabase.com:5432`, username `postgres.<ref>`) for `DIRECT_URL`, and the
   **transaction pooler** (`:6543` + `?pgbouncer=true`) for `DATABASE_URL`.

First-time schema creation uses `npm run db:push` (no shadow DB → avoids Supabase permission
issues). Switch to `db:migrate` for versioned migrations once the schema stabilizes.

## Handy commands
| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run db:migrate` | Apply schema changes (creates a migration) |
| `npm run db:push` | Push schema without a migration (quick prototyping) |
| `npm run db:studio` | Open Prisma Studio to browse data |
| `npm run db:seed` | Re-run the seed script |
