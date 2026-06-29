import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/db";
import { noteHref } from "@/lib/notifications/categories";

const PUBLIC = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:no-reply@oprix.gowithepic.com";

let ready = false;
function configure(): boolean {
  if (!PUBLIC || !PRIVATE) return false;
  if (!ready) {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    ready = true;
  }
  return true;
}

/** True when VAPID keys are configured (push can actually send). */
export function pushConfigured(): boolean {
  return !!PUBLIC && !!PRIVATE;
}

/**
 * Best-effort Web Push to every device the given users have subscribed on.
 * Expired subscriptions (404/410) are pruned. Never throws — push must never
 * break the action that triggered it.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; type?: string; meta?: unknown },
): Promise<void> {
  if (!configure()) return; // VAPID not set — skip silently (in-app bell still works)
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: ids } } });
  if (!subs.length) return;

  const url = noteHref(payload.type ?? "", payload.meta) ?? "/notifications";
  const data = JSON.stringify({ title: payload.title, body: payload.body, url });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    }),
  );
}
