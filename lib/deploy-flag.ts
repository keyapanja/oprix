import "server-only";

/**
 * "A deployment is on its way."
 *
 * Nothing on this server can work this out for itself. Coolify keeps the old
 * container serving for the whole build — measured: a full redeploy answered
 * every 2s health poll without a single failure — so from in here a deploy in
 * progress is indistinguishable from an ordinary quiet afternoon. And Coolify's
 * own notification webhook only fires on `deployment_success` / `deployment_failed`,
 * never on start, so it can't tell us either.
 *
 * What does know, at the moment it happens, is the push. A GitHub Action calls
 * /api/deploy-hook on every push to main — the same event that triggers Coolify
 * — and that lands here.
 *
 * Deliberately in memory, not the database:
 *  - it needs to outlive nothing. The flag matters only while the OLD container
 *    is still serving; once the new one takes over it reports a different build
 *    id, which is a better signal than any flag.
 *  - /api/health gets to keep its promise of touching no database, so a slow
 *    query still can't make a healthy deployment look dead.
 *  - no schema change, so no `db push` against the live database.
 *
 * Single-container deployment, so one process holding this is the whole truth.
 */

/** A deploy that hasn't landed by now has failed, or we missed the handover. */
const STALE_AFTER_MS = 20 * 60_000;

let startedAt: number | null = null;
let sha: string | null = null;

export function markDeploying(commitSha?: string | null): void {
  startedAt = Date.now();
  sha = commitSha?.trim() ? commitSha.trim().slice(0, 40) : null;
}

/**
 * True while a deploy is believed to be in flight.
 *
 * Self-expiring: a failed build never sends a "finished" signal, and a banner
 * nobody can dismiss is worse than no banner at all.
 */
export function isDeploying(): boolean {
  if (startedAt === null) return false;
  if (Date.now() - startedAt > STALE_AFTER_MS) {
    startedAt = null;
    sha = null;
    return false;
  }
  return true;
}

/** The commit being deployed, when the hook told us. For diagnostics only. */
export function deployingSha(): string | null {
  return isDeploying() ? sha : null;
}
