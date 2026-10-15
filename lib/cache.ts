import "server-only";
import { prisma } from "@/lib/db";

// Small in-process memo cache for values that are effectively static (company
// timezone, a user's display name). On a long-running server this turns these
// repeated lookups into ~free reads after the first hit, removing a DB
// round-trip from hot paths (navigation, punch, timer start/pause/resume).
function memo<T>(ttlMs: number, loader: (key: string) => Promise<T>) {
  const store = new Map<string, { val: T; exp: number }>();
  return async (key: string): Promise<T> => {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.exp > now) return hit.val;
    const val = await loader(key);
    store.set(key, { val, exp: now + ttlMs });
    return val;
  };
}

/** Company timezone (effectively immutable) — cached 10 minutes. */
export const getCompanyTimezone = memo(10 * 60_000, async (companyId: string) => {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return c?.timezone ?? "Asia/Kolkata";
});

/** Actor display label (employee name, else the nickname a portal user set,
 *  else email) — cached 5 minutes. Clients have no Employee row, so without the
 *  nickname their comments and history read as a bare email address. */
export const getActorLabel = memo(5 * 60_000, async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, nickname: true, employee: { select: { fullName: true } } },
  });
  return user?.employee?.fullName ?? (user?.nickname?.trim() || user?.email) ?? "Someone";
});
