import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui/page-header";
import { listClientTasks } from "@/lib/tasks/client-tasks";
import { ClientTasksList } from "@/components/tasks/client-tasks-list";

export const metadata: Metadata = { title: "Client tasks · Oprix" };

export default async function ClientTasksPage() {
  // Gated like the Tasks module (task:manage) — anyone who holds tasks can see
  // their client tasks; the list auto-scopes (admins see all, others their own).
  const session = await requirePage("task:manage");
  const { rows, scope } = await listClientTasks(session);

  return (
    <div>
      <PageHeader
        title="Client tasks"
        description={
          scope === "ALL"
            ? `${rows.length} task${rows.length === 1 ? "" : "s"} raised by clients across the company.`
            : `${rows.length} client task${rows.length === 1 ? "" : "s"} assigned to you.`
        }
      />
      <ClientTasksList rows={rows} />
    </div>
  );
}
