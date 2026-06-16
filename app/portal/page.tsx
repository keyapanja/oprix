import type { Metadata } from "next";
import Link from "next/link";
import { requirePortal } from "@/lib/auth/guard";
import { safeHref } from "@/lib/url";
import {
  getPortalSummary,
  listClientProjects,
  listPendingTaskReviews,
  listClientDeliverables,
} from "@/lib/portal/data";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { ProjectCard } from "@/components/portal/project-card";
import { ReviewControls } from "@/components/portal/review-controls";
import { DeliverableCard } from "@/components/portal/deliverable-card";

export const metadata: Metadata = { title: "Overview · Client Portal" };

function StatCard({ icon, label, value, highlight }: { icon: string; label: string; value: number; highlight?: boolean }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span
        className={
          highlight
            ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300"
            : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"
        }
      >
        <Icon name={icon} className="size-5" />
      </span>
      <div>
        <p className="text-2xl font-bold leading-none text-content">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </Card>
  );
}

export default async function PortalHomePage() {
  const session = await requirePortal();
  const [summary, projects, pendingTasks, deliverables] = await Promise.all([
    getPortalSummary(session.clientId, session.companyId),
    listClientProjects(session.clientId, session.companyId),
    listPendingTaskReviews(session.clientId, session.companyId),
    listClientDeliverables(session.clientId, session.companyId),
  ]);
  const pendingDeliverables = deliverables.filter((d) => d.status === "SUBMITTED");
  const awaiting = pendingTasks.length + pendingDeliverables.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-content">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          {awaiting > 0
            ? `You have ${awaiting} item${awaiting > 1 ? "s" : ""} awaiting your review.`
            : "You're all caught up — nothing needs your review right now."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon="briefcase" label="Projects" value={summary.projectCount} />
        <StatCard icon="check" label="Tasks to review" value={summary.tasksAwaiting} highlight={summary.tasksAwaiting > 0} />
        <StatCard icon="folder" label="Deliverables to review" value={summary.deliverablesAwaiting} highlight={summary.deliverablesAwaiting > 0} />
      </div>

      {awaiting > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">Awaiting your review</h2>
          {pendingTasks.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-content">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.project.name}
                    {t.service?.name ? ` · ${t.service.name}` : ""}
                  </p>
                </div>
                {t.finalLink && (
                  <a
                    href={safeHref(t.finalLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
                  >
                    <Icon name="folder" className="size-4" />
                    Open preview
                  </a>
                )}
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <ReviewControls kind="task" id={t.id} />
              </div>
            </Card>
          ))}
          {pendingDeliverables.map((d) => (
            <DeliverableCard key={d.id} d={d} showProject />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">Your projects</h2>
          {projects.length > 4 && (
            <Link href="/portal/projects" className="text-sm font-medium text-accent-strong hover:underline">
              View all
            </Link>
          )}
        </div>
        {projects.length === 0 ? (
          <Card className="px-5 py-12 text-center text-sm text-muted">No projects yet.</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.slice(0, 4).map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
