import Link from "next/link";
import type { ProjectStatus, ProjectType } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate } from "@/lib/format";
import { PROJECT_STATUS_TONE } from "@/lib/status";
import { ProgressBar } from "@/components/portal/progress-bar";

export type PortalProjectCard = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  type: ProjectType;
  dueDate: Date | null;
  progress: { pct: number; total: number; completed: number; awaitingReview: number };
};

export function ProjectCard({ p }: { p: PortalProjectCard }) {
  return (
    <Link href={`/portal/projects/${p.id}`} className="block">
      <Card className="h-full p-5 transition-colors hover:bg-canvas">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-semibold text-content">{p.name}</h3>
          <Badge tone={PROJECT_STATUS_TONE[p.status]}>{humanizeEnum(p.status)}</Badge>
        </div>
        {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}

        {p.type === "RECURRING" ? (
          <p className="mt-4 text-xs text-muted">Recurring project</p>
        ) : (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {p.progress.completed} of {p.progress.total} tasks done
              </span>
              <span className="font-medium text-content">{p.progress.pct}%</span>
            </div>
            <ProgressBar pct={p.progress.pct} />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-faint">Due {formatDate(p.dueDate)}</span>
          {p.progress.awaitingReview > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
              {p.progress.awaitingReview} to review
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
