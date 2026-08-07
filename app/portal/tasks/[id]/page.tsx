import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/auth/guard";
import { getClientTask, getClientTaskActivity } from "@/lib/portal/data";
import { safeHref, isHttpUrl } from "@/lib/url";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { BackLink } from "@/components/ui/back-link";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { formatDate, formatDateTime } from "@/lib/format";
import { ReviewControls } from "@/components/portal/review-controls";
import { ClientTaskActions } from "@/components/portal/client-task-actions";

export const metadata: Metadata = { title: "Task · Client Portal" };

type Tone = "gray" | "green" | "amber" | "blue" | "red";

// Client-facing status — internal workflow states collapse to "In progress" so
// the portal never exposes the team's internal pipeline (matches the list).
function taskPill(status: string): { tone: Tone; label: string } {
  if (status === "COMPLETED") return { tone: "green", label: "Done" };
  if (status === "CLIENT_REVIEW") return { tone: "amber", label: "Needs your review" };
  return { tone: "blue", label: "In progress" };
}

export default async function PortalTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortal();

  const task = await getClientTask(session.clientId, session.companyId, id);
  if (!task) notFound();
  const activity = await getClientTaskActivity(session.companyId, task.id);

  const pill = taskPill(task.status);
  const inReview = task.status === "CLIENT_REVIEW";
  const dueISO = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={`/portal/projects/${task.project.id}`}>Back to {task.project.name}</BackLink>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-content">{task.name}</h1>
            <p className="mt-1 text-sm text-faint">
              {task.createdById === session.userId ? "Raised by you" : "From your team"}
              {task.dueDate ? ` · Due ${formatDate(task.dueDate)}` : ""}
            </p>
          </div>
          <Badge tone={pill.tone}>{pill.label}</Badge>
        </div>

        {task.service?.name && <p className="mt-3 text-sm text-muted">{task.service.name}</p>}

        {task.description && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Details</p>
            <LinkifiedText text={task.description} className="text-sm leading-relaxed text-content" />
          </div>
        )}
      </Card>

      {inReview && (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-content">Your review</h2>
          <p className="mb-3 text-xs text-muted">Approve the work, or send it back with feedback.</p>
          {task.finalLink && (
            <div className="mb-3">
              {isHttpUrl(task.finalLink) ? (
                <a
                  href={safeHref(task.finalLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
                >
                  <Icon name="folder" className="size-4" /> Open preview
                </a>
              ) : (
                <span className="text-sm text-muted">{task.finalLink}</span>
              )}
            </div>
          )}
          <ReviewControls kind="task" id={task.id} />
        </Card>
      )}

      {/* Edit / withdraw — only for tasks the client raised. */}
      {task.clientRaised && (
        <ClientTaskActions
          task={{
            id: task.id,
            name: task.name,
            description: task.description,
            priority: task.priority,
            dueDate: dueISO,
            projectId: task.project.id,
          }}
        />
      )}

      {/* History */}
      <Card>
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-content">History</h2>
        </div>
        <div className="max-h-[28rem] overflow-y-auto p-5">
          {activity.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => {
                const actor = (a.meta as { actor?: string } | null)?.actor ?? "Someone";
                return (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    <div>
                      <p className="text-content">
                        <span className="font-medium">{actor}</span> {a.action}
                      </p>
                      <p className="text-xs text-faint">{formatDateTime(a.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
