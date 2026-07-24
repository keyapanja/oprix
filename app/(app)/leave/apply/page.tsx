import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { computeBalances } from "@/lib/leave/balance";
import { getWorkWeek } from "@/lib/leave/count";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/ui/back-link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ApplyForm } from "@/components/leave/apply-form";
import { LeavePolicy } from "@/components/leave/leave-policy";

export const metadata: Metadata = { title: "Apply for leave · Oprix" };

export default async function ApplyLeavePage() {
  const session = await requirePage();

  if (!session.employeeId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Apply for leave" description="Request time off or work-from-home." />
        <Card className="p-8 text-center text-sm text-muted">
          No employee profile is linked to your account, so you can&apos;t apply for leave.
        </Card>
      </div>
    );
  }

  const [balances, workWeek, holidayRows] = await Promise.all([
    computeBalances(session.companyId, session.employeeId),
    getWorkWeek(session.companyId),
    prisma.holiday.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      select: { date: true },
    }),
  ]);
  const holidays = holidayRows.map((h) => h.date.toISOString().slice(0, 10));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <BackLink href="/leave">Back to leave</BackLink>
      </div>
      <PageHeader title="Apply for leave or WFH" description="Request time off or work-from-home." />
      <LeavePolicy />
      <ApplyForm
        balances={balances.map((b) => ({
          typeId: b.typeId,
          name: b.name,
          remaining: b.remaining,
          allowance: b.allowance,
          period: b.period,
          unlimited: b.unlimited,
          used: b.used,
          attachmentEnabled: b.attachmentEnabled,
        }))}
        workWeek={workWeek}
        holidays={holidays}
      />
    </div>
  );
}
