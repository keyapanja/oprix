import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { getProjectAssets } from "@/lib/storage/data";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { BackLink } from "@/components/ui/back-link";
import { Section } from "@/components/reports/blocks";
import { AssetTable } from "@/components/storage/asset-table";
import { PROJECT_STATUS_TONE } from "@/lib/status";
import { formatBytes, humanizeEnum } from "@/lib/format";

export const metadata: Metadata = { title: "Project storage · Oprix" };

export default async function ProjectStoragePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage("org:manage");

  const data = await getProjectAssets(session.companyId, id);
  if (!data) notFound();
  const { project, assets } = data;

  const files = assets.filter((a) => !a.url);
  const bytes = files.reduce((s, a) => s + (a.sizeBytes ?? 0), 0);
  const missing = files.filter((a) => a.missing).length;

  return (
    <div className="space-y-6">
      <BackLink href="/storage">Storage</BackLink>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-content">{project.name}</h1>
            <Badge tone={PROJECT_STATUS_TONE[project.status]}>{humanizeEnum(project.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {project.client ?? "No client"} ·{" "}
            <Link href={`/projects/${project.id}`} className="hover:text-content">
              Open the project
            </Link>
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold text-content">{formatBytes(bytes)}</p>
          <p className="text-sm text-muted">
            across {files.length} file{files.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {missing > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25">
          <Icon name="folder" className="mt-0.5 size-4 shrink-0" />
          <p>
            {missing === 1 ? "One file is" : `${missing} files are`} listed here but no longer on
            disk. {missing === 1 ? "It counts" : "They count"} toward the size above and{" "}
            {missing === 1 ? "its row" : "their rows"} can be deleted safely — nothing is freed.
          </p>
        </div>
      )}

      <Section
        title="Files"
        subtitle="Everything attached to this project or to one of its tasks, including images pasted into comments."
      >
        <AssetTable assets={assets} />
      </Section>
    </div>
  );
}
