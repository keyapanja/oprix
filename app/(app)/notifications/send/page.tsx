import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/ui/back-link";
import { SendNotificationForm } from "@/components/notifications/send-notification-form";

export const metadata: Metadata = { title: "Send notification · Oprix" };

export default async function SendNotificationPage() {
  const session = await requirePage("employee:manage");

  const [departments, employees] = await Promise.all([
    prisma.department.findMany({
      where: { companyId: session.companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Only people with an active login can receive an in-app / push notification.
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null, user: { is: { isActive: true } } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, department: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink href="/notifications">Back to notifications</BackLink>
      </div>
      <PageHeader
        title="Send a notification"
        description="Push a one-off message to your team — everyone, specific departments, or specific people."
      />
      <SendNotificationForm
        departments={departments}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName, department: e.department?.name ?? null }))}
      />
    </div>
  );
}
