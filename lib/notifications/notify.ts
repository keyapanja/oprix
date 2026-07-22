import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push/send";
import { sendNotificationEmail, appUrl } from "@/lib/email";
import { emailEnabled, noteHref } from "@/lib/notifications/categories";

type NotifyInput = {
  type: string;
  title: string;
  body: string;
  meta?: Prisma.InputJsonValue;
  /** Set false to send in-app + push only (e.g. noisy company-wide broadcasts). */
  email?: boolean;
};

/**
 * Single entry point for notifying users. For each recipient it:
 *   1. writes the in-app bell row,
 *   2. fires a Web Push to their subscribed devices, and
 *   3. sends an email — but only if they've opted into this category (see
 *      emailEnabled) and have an address.
 * Route every notification source through this so each type reaches people
 * in-app, via OS push, and (per their prefs) by email. Push and email are
 * best-effort and never block or fail the action that triggered the notify.
 */
export async function notify(userIds: string[], input: NotifyInput): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;

  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      meta: input.meta,
    })),
  });

  await Promise.all([
    sendPushToUsers(ids, {
      title: input.title,
      body: input.body,
      type: input.type,
      meta: input.meta,
    }).catch(() => {}),
    input.email === false ? Promise.resolve() : sendNotificationEmails(ids, input).catch(() => {}),
  ]);
}

/** Email the recipients who have opted into this category and have an address. */
async function sendNotificationEmails(ids: string[], input: NotifyInput): Promise<void> {
  const recipients = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: {
      email: true,
      emailPrefs: true,
      employee: { select: { fullName: true } },
    },
  });
  const targets = recipients.filter(
    (u) => u.email && emailEnabled(u.emailPrefs, input.type),
  );
  if (!targets.length) return;

  const href = noteHref(input.type, input.meta) ?? "/notifications";
  const link = appUrl(href);

  await Promise.all(
    targets.map((u) =>
      sendNotificationEmail({
        to: u.email,
        name: u.employee?.fullName ?? null,
        title: input.title,
        body: input.body,
        link,
      }).catch(() => {
        /* one bad address shouldn't stop the others */
      }),
    ),
  );
}
