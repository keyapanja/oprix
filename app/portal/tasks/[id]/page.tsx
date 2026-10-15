import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/auth/guard";
import { taskPill } from "@/lib/portal/status";
import { getClientTask, getClientTaskActivity, getClientTaskComments } from "@/lib/portal/data";
import { safeHref, isHttpUrl } from "@/lib/url";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { BackLink } from "@/components/ui/back-link";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { formatDate, formatDateTime } from "@/lib/format";
import { ReviewControls } from "@/components/portal/review-controls";
import { ClientTaskActions } from "@/components/portal/client-task-actions";
import { PortalAttachments } from "@/components/portal/portal-attachments";
import { CommentForm } from "@/components/tasks/comment-form";
import { CommentItem } from "@/components/tasks/comment-item";
import { LiveRefresh } from "@/components/timer/live-refresh";

export const metadata: Metadata = { title: "Task · Client Portal" };



export default async function PortalTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortal();

  const task = await getClientTask(session.clientId, session.companyId, id);
  if (!task) notFound();
  const [activity, { comments, people }] = await Promise.all([
    getClientTaskActivity(session.companyId, task.id),
    getClientTaskComments(task.id),
  ]);

  const pill = taskPill(task.status);
  const inReview = task.status === "CLIENT_REVIEW";
  const dueISO = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null;

  return (
    <div className="space-y-6">
      {/* The thread is shared with the team, so their replies should turn up
          without a reload — same cadence as the team's own task page. */}
      <LiveRefresh seconds={10} />
      <BackLink href={`/portal/projects/${task.project.id}`}>Back to {task.project.name}</BackLink>

      {/* Two columns on wide screens: the task on the left, the conversation on
          the right. On a phone they stack, and the left column's wrapper
          dissolves (`contents`) so its cards join the grid and the order-*
          classes can put the comments above the history, not at the very end. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:block lg:space-y-6">
          <Card className="order-1 p-6">
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

            {task.attachments.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Attachments</p>
                <PortalAttachments attachments={task.attachments} canManage={task.clientRaised} />
              </div>
            )}
          </Card>

          {inReview && (
            <Card className="order-2 p-5">
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
            <div className="order-3">
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
            </div>
          )}

          {/* History */}
          <Card className="order-5">
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

        {/* Comments — one thread with the team: every comment, theirs and ours.
            Pinned under the sticky header on wide screens and capped to the
            viewport, so the box stays in reach and a long thread scrolls inside
            the panel instead of stretching the page. */}
        <Card className="order-4 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-8rem)] lg:flex-col">
          <div className="shrink-0 border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-content">
              Comments
              {comments.length > 0 && <span className="ml-1.5 font-normal text-faint">{comments.length}</span>}
            </h2>
          </div>
          <div className="space-y-4 p-5 lg:flex lg:min-h-0 lg:flex-col">
            <div className="shrink-0">
              <CommentForm taskId={task.id} people={people} portal />
            </div>
            {comments.length === 0 ? (
              <p className="text-sm text-muted">No comments yet. Ask a question or leave a note for the team.</p>
            ) : (
              <ul className="space-y-4 border-t border-line pt-4 lg:-mr-2 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
                {[...comments].reverse().map((c) => (
                  <CommentItem
                    key={c.id}
                    id={c.id}
                    taskId={task.id}
                    people={people}
                    authorName={c.authorName}
                    authorEmpId={null}
                    body={c.body}
                    time={formatDateTime(c.createdAt)}
                    isMine={c.authorId === session.userId}
                    portal
                  />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
