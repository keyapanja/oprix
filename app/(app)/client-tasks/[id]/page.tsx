import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { isClientRaisedTask } from "@/lib/tasks/client-tasks";
import { TaskDetail } from "@/components/tasks/task-detail";

export const metadata: Metadata = { title: "Client task · Oprix" };

export default async function ClientTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage();

  // Only client-raised tasks belong here; anything else falls back to the normal
  // task detail so each task keeps a single canonical URL.
  if (!(await isClientRaisedTask(session.companyId, id))) redirect(`/tasks/${id}`);

  return <TaskDetail taskId={id} session={session} backHref="/client-tasks" clientRaised />;
}
