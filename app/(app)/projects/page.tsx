import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { humanizeEnum, formatDate } from "@/lib/format";
import { PROJECT_STATUS_TONE, PRIORITY_TONE } from "@/lib/status";

export const metadata: Metadata = { title: "Projects · Operix" };

export default async function ProjectsPage() {
  const session = await requirePage("project:manage");

  const projects = await prisma.project.findMany({
    where: { companyId: session.companyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      type: true,
      dueDate: true,
      client: { select: { name: true } },
      tasks: { select: { status: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Projects"
        description={`${projects.length} ${projects.length === 1 ? "project" : "projects"}.`}
        action={
          <Link href="/projects/new">
            <Button>
              <Icon name="plus" className="size-4" />
              New project
            </Button>
          </Link>
        }
      />

      {projects.length === 0 ? (
        <Card className="px-5 py-16 text-center">
          <p className="text-sm text-muted">No projects yet.</p>
          <Link href="/projects/new" className="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline">
            Create your first project →
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const total = p.tasks.length;
            const done = p.tasks.filter((t) => t.status === "COMPLETED").length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card hover className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-content">{p.name}</h3>
                    <Badge tone={PROJECT_STATUS_TONE[p.status]}>{humanizeEnum(p.status)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{p.client?.name ?? "No client"}</p>

                  {p.type === "RECURRING" ? (
                    <div className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                      <Icon name="calendarDays" className="size-3.5 text-faint" />
                      <span>Recurring · {total} task{total === 1 ? "" : "s"}</span>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted">
                        <span>{done} of {total} tasks</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-canvas">
                        <div className="gradient-brand h-full rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <Badge tone={PRIORITY_TONE[p.priority]}>{humanizeEnum(p.priority)}</Badge>
                    <span className="text-xs text-muted">Due {formatDate(p.dueDate)}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
