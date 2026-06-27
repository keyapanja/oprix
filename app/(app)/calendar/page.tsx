import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getMonthCalendar } from "@/lib/calendar/data";
import { computeBalances } from "@/lib/leave/balance";
import { nowInZone } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { CalendarAdminControls } from "@/components/calendar/admin-controls";

export const metadata: Metadata = { title: "Calendar · Oprix" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await requirePage();
  const sp = await searchParams;

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { timezone: true },
  });
  const todayISO = nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO;
  const currentYm = todayISO.slice(0, 7);

  const ym = sp.ym && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : currentYm;
  const [year, month] = ym.split("-").map(Number);

  const [canManage, data, balances] = await Promise.all([
    hasPermission(session.companyId, session.role, "org:manage"),
    getMonthCalendar(session.companyId, year, month - 1),
    session.employeeId
      ? computeBalances(session.companyId, session.employeeId)
      : Promise.resolve([]),
  ]);
  // Applying for leave/WFH from the calendar was removed — people apply at
  // /leave/apply. The calendar keeps date-selection for admins (holidays /
  // announcements) only. (Calendar apply-leave code is kept but never enabled.)
  const canApplyLeave = false;

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Holidays, who's away, and company announcements."
      />
      {canManage && <CalendarAdminControls />}
      <CalendarView
        ym={ym}
        data={data}
        today={todayISO}
        currentYm={currentYm}
        canManage={canManage}
        canApplyLeave={canApplyLeave}
        currentUserId={session.userId}
        isSuperAdmin={session.role === "SUPER_ADMIN"}
        balances={balances.map((b) => ({
          typeId: b.typeId,
          name: b.name,
          remaining: b.remaining,
          allowance: b.allowance,
          period: b.period,
          unlimited: b.unlimited,
          used: b.used,
        }))}
      />
    </>
  );
}
