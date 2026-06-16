import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { listPermissions } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getActiveTimers } from "@/lib/timer/data";
import { hasPunchedInToday } from "@/lib/attendance/gate";
import { sendEventReminders } from "@/lib/calendar/reminders";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { TimerBar } from "@/components/timer/timer-bar";
import { PunchInBanner } from "@/components/attendance/punch-banner";
import { noteHref, formatNoteTime, type ClientNote } from "@/lib/notifications/categories";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Hard isolation: clients never see the internal app (the proxy redirects
  // first; this is a defense-in-depth backstop if the matcher ever changes).
  if (session.role === "CLIENT") redirect("/portal");

  const isGatedEmployee = session.role === "EMPLOYEE" && !!session.employeeId;

  // One parallel batch for the whole shell instead of several sequential queries.
  const [needsPunchIn, allowed, notifications, unread, activeTimers, company, me] = await Promise.all([
    isGatedEmployee
      ? hasPunchedInToday(session.employeeId!, session.companyId).then((p) => !p)
      : Promise.resolve(false),
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

  // Base employees must clock in before reaching anything but the dashboard.
  if (needsPunchIn) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname && pathname !== "/dashboard") redirect("/dashboard");
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
        company={{
          name: company?.name ?? "Operix",
          tagline: company?.tagline || company?.businessType || null,
          logoUrl: company?.logoUrl ?? null,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={session.email}
          role={session.role}
          name={me?.nickname || session.email}
          avatarName={me?.employee?.fullName || me?.nickname || session.email}
          avatarUrl={me?.avatarUrl ?? null}
          notifications={notes}
          unread={unread}
        />
        {needsPunchIn && <PunchInBanner />}
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
