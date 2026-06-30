import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/auth/guard";
import { getClientProject, progressOf } from "@/lib/portal/data";
import { safeHref, isHttpUrl } from "@/lib/url";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { BackLink } from "@/components/ui/back-link";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { humanizeEnum, formatDate } from "@/lib/format";
import { PROJECT_STATUS_TONE, PRIORITY_TONE } from "@/lib/status";
import { ProgressBar } from "@/components/portal/progress-bar";
import { ReviewControls } from "@/components/portal/review-controls";
import { DeliverableCard } from "@/components/portal/deliverable-card";

export const metadata: Metadata = { title: "Project · Client Portal" };

type Tone = "gray" | "green" | "amber" | "blue" | "red";

// Client-facing status — internal workflow states (review/redo) collapse to
// "In progress" so the portal never exposes the team's internal pipeline.
function taskPill(status: string): { tone: Tone; label: string } {
  if (status === "COMPLETED") return { tone: "green", label: "Done" };
  if (status === "CLIENT_REVIEW") return { tone: "amber", label: "Needs your review" };
  return { tone: "blue", label: "In progress" };
}

export default async function PortalProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortal();

  const project = await getClientProject(session.clientId, session.companyId, id);
  if (!project) notFound();

  const progress = progressOf(project.tasks);
  const pendingTasks = project.tasks.filter((t) => t.status === "CLIENT_REVIEW");
  const pendingDeliverables = project.deliverables.filter((d) => d.status === "SUBMITTED");
  const pastDeliverables = project.deliverables.filter((d) => d.status !== "SUBMITTED");
  const needsReview = pendingTasks.length + pendingDeliverables.length;

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/portal/projects">Back to projects</BackLink>
      </div>

      {/* Header */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-content">{project.name}</h1>
            {project.description && (
              <LinkifiedText text={project.description} className="mt-2 max-w-2xl text-sm text-muted" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={PRIORITY_TONE[project.priority]}>{humanizeEnum(project.priority)}</Badge>
            <Badge tone={PROJECT_STATUS_TONE[project.status]}>{humanizeEnum(project.status)}</Badge>
          </div>
        </div>

        {project.type !== "RECURRING" && (
          <div className="mt-5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{progress.completed} of {progress.total} tasks completed</span>
              <span className="font-medium text-content">{progress.pct}%</span>
            </div>
            <ProgressBar pct={progress.pct} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-sm">
          <div>
            <span className="text-faint">Start</span>{" "}
            <span className="font-medium text-content">{formatDate(project.startDate)}</span>
          </div>
          <div>
            <span className="text-faint">Due</span>{" "}
            <span className="font-medium text-content">{formatDate(project.dueDate)}</span>
          </div>
        </div>
      </Card>

      {/* Awaiting your review */}
      {needsReview > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-faint">
            <span className="size-1.5 rounded-full bg-amber-500" />
            Awaiting your review
          </h2>
          {pendingTasks.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-content">{t.name}</p>
                  {t.service?.name && <p className="text-xs text-muted">{t.service.name}</p>}
                </div>
                {t.finalLink &&
                  (isHttpUrl(t.finalLink) ? (
                    <a
                      href={safeHref(t.finalLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
                    >
                      <Icon name="folder" className="size-4" />
                      Open preview
                    </a>
                  ) : (
                    <span className="text-sm text-muted">{t.finalLink}</span>
                  ))}
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <ReviewControls kind="task" id={t.id} />
              </div>
            </Card>
          ))}
          {pendingDeliverables.map((d) => (
            <DeliverableCard key={d.id} d={d} />
          ))}
        </section>
      )}

      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">Work</h2>
          {project.tasks.length === 0 ? (
            <Card className="px-5 py-10 text-center text-sm text-muted">No tasks yet.</Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {project.tasks.map((t) => {
                const pill = taskPill(t.status);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-content">{t.name}</p>
                      {t.service?.name && <p className="text-xs text-faint">{t.service.name}</p>}
                    </div>
                    <Badge tone={pill.tone}>{pill.label}</Badge>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>

      {/* Deliverables history */}
      {pastDeliverables.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">Deliverables</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pastDeliverables.map((d) => (
              <DeliverableCard key={d.id} d={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
