# Deploying Oprix on Coolify (Hostinger KVM)

Goal: bring Oprix live at **https://oprix.gowithepic.com** as a brand-new,
**fully isolated** Coolify project — without touching any existing project,
file, or database on the server.

**Isolation guarantees**
- We only ever **create new** resources (a new Project, a new Postgres, a new
  App). No existing resource is edited.
- The new Postgres is its own container + its own volume — no other database is
  read or written.
- Coolify's shared Traefik proxy just **adds one route** for `oprix.gowithepic.com`.
- `prisma db push` is run **only** against a database we've confirmed is empty /
  Oprix-only (see Step 3).

Build artifacts already in the repo: [`Dockerfile`](../Dockerfile),
[`.dockerignore`](../.dockerignore). The app is built with full `node_modules`
(not standalone) so Prisma's engine works and first-time `db push` + seed run
inside the container. Uploads are written to `/app/uploads`, which we back with a
persistent volume so files survive redeploys.

---

## Step 1 — DNS
In your DNS provider for `gowithepic.com`, add:

| Type | Name | Value |
|------|------|-------|
| A | `oprix` | `<your KVM server's public IP>` |

(Proxy/orange-cloud OFF if using Cloudflare, so Let's Encrypt can validate; you
can re-enable later.) Wait for it to resolve (`nslookup oprix.gowithepic.com`).

## Step 2 — New Coolify project
Coolify → **Projects → + New** → name it **Oprix** → Environment **production**.
Everything below lives inside this project, separate from your others.

## Step 3 — Database (DO THIS CAREFULLY)
> ⚠️ **Guardrail:** never run `db push` against a database that holds another
> project's tables. When unsure, create a new one — it's zero-risk.

**Recommended — create a new, isolated Postgres:**
1. Inside the Oprix project → **+ New Resource → Database → PostgreSQL 16**.
2. Name it `oprix-db`. Create it. Coolify generates credentials.
3. Open it → copy the **Postgres URL (internal)** — looks like
   `postgresql://postgres:<pass>@<internal-host>:5432/postgres`. You'll paste it
   into the app's env in Step 5.

**Only if you want to reuse the existing `oprix-api` database:** first confirm it
is **empty or already Oprix's** — in Coolify open that Postgres → **Terminal** →
`psql $POSTGRES_URL -c "\dt"`. If it lists **no tables** (or only Oprix tables
from a prior attempt), it's safe to use. If it lists **any other project's
tables, stop** and use a new `oprix-db` instead.

> Self-hosted Postgres has no pgbouncer, so the app uses the **same** URL for both
> `DATABASE_URL` and `DIRECT_URL`.

## Step 4 — Create the app
Oprix project → **+ New Resource → Application → Public Repository**.
- Repository: `https://github.com/keyapanja/operix`  ·  Branch: `main`
- Build Pack: **Dockerfile**  (Dockerfile path: `/Dockerfile`)
- Port: **3000**
- Don't deploy yet — set env + storage + domain first.

## Step 5 — Environment variables
App → **Environment Variables** → add (mark secrets as such):

```
DATABASE_URL   = <the internal Postgres URL from Step 3>
DIRECT_URL     = <the same internal Postgres URL>
AUTH_SECRET    = <generate: see below>
APP_URL        = https://oprix.gowithepic.com
CRON_SECRET    = <generate: see below>
DEPLOY_HOOK_SECRET = <generate: see below>   # see "Deploy notice" below
EXTENSION_ORIGINS =            # leave empty until the extension is published
# SMTP (so invites + password resets actually send):
SMTP_HOST      = <your provider host>
SMTP_PORT      = 587
SMTP_USER      = <smtp user>
SMTP_PASS      = <smtp password>
SMTP_FROM      = Oprix <no-reply@gowithepic.com>
```

Generate the two secrets (run anywhere, e.g. the server shell) and paste the
output — **don't reuse the localhost values**:
```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
```

## Step 6 — Persistent storage for uploads (important)
App → **Storages → + Add** → **Volume Mount**:
- Destination path: `/app/uploads`
- Name: `oprix-uploads`

Without this, every redeploy would wipe uploaded attachments/avatars/logos
(they live on disk, not in the DB).

## Step 7 — Domain + SSL
App → **Domains** → set `https://oprix.gowithepic.com`. Coolify/Traefik issues a
Let's Encrypt certificate automatically once DNS (Step 1) resolves.

## Step 8 — Deploy
Click **Deploy**. Watch the build logs. The image runs `prisma generate` +
`next build`, then serves with `next start` on port 3000. (Share the logs with me
if anything fails — I'll fix it.)

## Step 9 — One-time schema + admin seed
After the first successful deploy, App → **Terminal** (execs into the running
container). The DB is empty, so create the schema and seed your admin:

```bash
# 1) Create all tables from the Prisma schema
npx prisma db push

# 2) Seed the company + Super Admin (invite state — no password set by anyone)
COMPANY_NAME='Epic Businesses' ADMIN_EMAIL='access@gowithepic.com' \
  npx tsx prisma/reset.ts --confirm
```

The second command prints a **set-password URL** on your live domain
(`https://oprix.gowithepic.com/set-password?token=…`). Open it, choose your
password, then log in. (On a fresh DB the script's "wipe" truncates nothing — it
just seeds.)

## Step 10 — Smoke test
1. Visit `https://oprix.gowithepic.com` → you should hit the login page over HTTPS.
2. Use the set-password link → set password → log in as `access@gowithepic.com`.
3. Confirm the dashboard loads (0 of everything, clean).
4. Upload a logo in Settings, redeploy once, confirm the logo persists (verifies
   the uploads volume).

---

## Post-launch
- **Email:** trigger a password reset to confirm SMTP delivers in production.
- **Scheduled jobs:** point a scheduler at `https://oprix.gowithepic.com/api/cron`
  with header `Authorization: Bearer <CRON_SECRET>` (Coolify has a Scheduled
  Tasks feature, or use any cron). Day-before reminders + late-login notices.
- **Browser extension:** once you load/publish it against the live origin, set
  `EXTENSION_ORIGINS = chrome-extension://<id>` in the app env and redeploy, and
  point the extension's "Oprix address" at `https://oprix.gowithepic.com`.

### Deploy notice ("An update is on the way")

Coolify keeps the **old** container serving for the whole build — a full
redeploy was measured answering every 2-second health poll without a single
failure — so from inside the app, a deploy in progress is indistinguishable
from a quiet afternoon. Coolify's notification webhook can't help either: its
events are `deployment_success` / `deployment_failed` / `status_changed` /
`restart_limit_reached`, and **none of them fire on start**.

The one thing that happens at the right moment is the push. So
`.github/workflows/announce-deploy.yml` pings the running app on every push to
`main` — the same event that triggers Coolify's build.

Three settings, all the same secret:

1. Generate one: `openssl rand -base64 32`
2. **Coolify** → app → Environment Variables → `DEPLOY_HOOK_SECRET` = that value
3. **GitHub** → repo → Settings → Secrets and variables → Actions → add
   `DEPLOY_HOOK_SECRET` (same value) and `APP_URL` = `https://oprix.gowithepic.com`

Without them the workflow prints "skipping" and exits 0 — pushes and deploys are
never blocked by this, it just goes quiet. To check it by hand:

```bash
curl -X POST -H "Authorization: Bearer $DEPLOY_HOOK_SECRET" https://oprix.gowithepic.com/api/deploy-hook
curl -s https://oprix.gowithepic.com/api/health     # -> "deploying":true
```

The flag lives in memory and expires after 20 minutes, so a failed build can't
leave a banner nobody can dismiss. It clears for real when the new container
takes over, because that container reports a different build id — which is what
turns the notice into "a new version is live, reload".

## Redeploys
Push to `main` → Coolify rebuilds and redeploys. The Postgres data and the
`/app/uploads` volume persist across deploys. No schema step is needed again
unless `prisma/schema.prisma` changed — then re-run `npx prisma db push` from the
container terminal (Step 9.1).
