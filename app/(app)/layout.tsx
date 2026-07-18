import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listPermissions } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getActiveTimers } from "@/lib/timer/data";
import { sendEventReminders } from "@/lib/calendar/reminders";
import { sendFormReminders } from "@/lib/forms/notify-cron";
import { runRecurringTasks } from "@/lib/tasks/recurring-cron";
import { listMenuForms } from "@/lib/forms/data";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { TimerBar } from "@/components/timer/timer-bar";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { noteHref, formatNoteTime, type ClientNote } from "@/lib/notifications/categories";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/logout");
  // Hard isolation: clients never see the internal app (the proxy redirects
  // first; this is a defense-in-depth backstop if the matcher ever changes).
  if (session.role === "CLIENT") redirect("/portal");

  // One parallel batch for the whole shell instead of several sequential queries.
  const [allowed, notifications, unread, activeTimers, company, me, menuForms] = await Promise.all([
    listPermissions(session.companyId, session.role),
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, body: true, type: true, meta: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: session.userId, isRead: false } }),
    getActiveTimers(session.userId),
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: {
        name: true,
        tagline: true,
        businessType: true,
        logoUrl: true,
        timezone: true,
        eventReminderEnabled: true,
        eventReminderTime: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { nickname: true, avatarUrl: true, employee: { select: { fullName: true } } },
    }),
    listMenuForms(session),
  ]);

  // Day-before holiday/announcement reminders (lazy — there's no in-app cron, so
  // the first page load past the configured time fans them out). Best-effort.
  if (company?.eventReminderEnabled) {
    try {
      await sendEventReminders({
        companyId: session.companyId,
        tz: company.timezone ?? "Asia/Kolkata",
        enabled: true,
        time: company.eventReminderTime ?? "09:00",
      });
    } catch {
      /* never break the shell on reminder failure */
    }
  }

  // Fire any due scheduled form-fill reminders (best-effort; atomic per day).
  try {
    await sendFormReminders({ companyId: session.companyId, tz: company?.timezone ?? "Asia/Kolkata" });
  } catch {
    /* never break the shell */
  }

  // Spawn any due recurring tasks (best-effort; each template claims its day atomically).
  try {
    await runRecurringTasks({ companyId: session.companyId, tz: company?.timezone ?? "Asia/Kolkata" });
  } catch {
    /* never break the shell */
  }

  const notes: ClientNote[] = notifications.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.type,
    href: noteHref(n.type, n.meta),
    time: formatNoteTime(n.createdAt),
  }));

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        allowed={allowed}
        isSuperAdmin={session.role === "SUPER_ADMIN"}
        isEmployee={!!session.employeeId}
        menuForms={menuForms}
        company={{
          name: company?.name ?? "Oprix",
          tagline: company?.tagline || company?.businessType || null,
          logoUrl: company?.logoUrl ?? null,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Global "enable notifications" nudge — banner above the header + a
            one-time login prompt. Hidden when push is off/unsupported/blocked. */}
        <PushPrompt vapidKey={process.env.VAPID_PUBLIC_KEY ?? null} />
        <Topbar
          email={session.email}
          role={session.role}
          name={me?.nickname || session.email}
          avatarName={me?.employee?.fullName || me?.nickname || session.email}
          avatarUrl={me?.avatarUrl ?? null}
          notifications={notes}
          unread={unread}
        />
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="animate-rise mx-auto max-w-[1600px]">{children}</div>
        </main>
        {/* Within the main content column (not under the sidebar). */}
        <TimerBar timers={activeTimers} />
      </div>
      <Toaster />
      <ConfirmHost />
    </div>
  );
}
