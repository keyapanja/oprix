import type { Metadata } from "next";
import { requirePage, sessionCan } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { clientRaisedFilter, listClientTasks } from "@/lib/tasks/client-tasks";
import { ClientTasksList } from "@/components/tasks/client-tasks-list";
import { TrashAllClientTasks } from "@/components/tasks/trash-all-client-tasks";

export const metadata: Metadata = { title: "Client tasks · Oprix" };

export default async function ClientTasksPage() {
  // Gated like the Tasks module (task:manage) — anyone who holds tasks can see
  // their client tasks; the list auto-scopes (admins see all, others their own).
  const session = await requirePage("task:manage");
  const { rows, scope } = await listClientTasks(session);

  // Admins can clear the whole list into Trash. The count is the real one —
  // the list above stops at 500 — and the cutoff is now, so the button only
  // ever takes what this page was showing.
  const canClear = await sessionCan(session, "org:manage");
  const cutoff = new Date();
  const total = canClear
    ? await prisma.task.count({
        where: {
          deletedAt: null,
          createdAt: { lte: cutoff },
          project: { companyId: session.companyId, deletedAt: null },
          ...(await clientRaisedFilter(session.companyId)),
        },
      })
    : 0;

  return (
    <div>
      <PageHeader
        title="Client tasks"
        description={
          scope === "ALL"
            ? `${rows.length} task${rows.length === 1 ? "" : "s"} raised by clients across the company.`
            : `${rows.length} client task${rows.length === 1 ? "" : "s"} assigned to you.`
        }
        action={canClear && total > 0 ? <TrashAllClientTasks total={total} cutoffISO={cutoff.toISOString()} /> : undefined}
      />
      <ClientTasksList rows={rows} />
    </div>
  );
}
