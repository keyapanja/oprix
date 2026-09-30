import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { isClientRaisedTask } from "@/lib/tasks/client-tasks";
import { TaskDetail } from "@/components/tasks/task-detail";

export const metadata: Metadata = { title: "Task · Oprix" };

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage();

  // Client-raised tasks have their own home under /client-tasks — send any
  // stale /tasks/[id] link (e.g. from an old notification) to the canonical URL.
  if (await isClientRaisedTask(session.companyId, id)) redirect(`/client-tasks/${id}`);

  return <TaskDetail taskId={id} session={session} backHref="/tasks" clientRaised={false} />;
}
