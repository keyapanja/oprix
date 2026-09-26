import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { getStorageOverview } from "@/lib/storage/data";
import { PageHeader } from "@/components/ui/page-header";
import { KpiGrid, Section } from "@/components/reports/blocks";
import { StorageTable } from "@/components/storage/storage-table";
import { formatBytes } from "@/lib/format";

export const metadata: Metadata = { title: "Storage · Oprix" };

export default async function StoragePage() {
  const session = await requirePage("org:manage");
  const { rows, projectBytes, projectFiles, trashed, other, disk } = await getStorageOverview(
    session.companyId,
  );

  // Whatever the folder weighs that no project/announcement/leave attachment
  // accounts for: employee documents, profile photos, the logo — and anything
  // an interrupted delete left behind.
  const untracked = Math.max(0, disk.bytes - projectBytes - trashed.bytes - other.bytes);
  // A capped walk under-counts, so every disk-derived number becomes a floor.
  const atLeast = (n: number) => (disk.truncated ? `≥ ${formatBytes(n)}` : formatBytes(n));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage"
        description="What each project is costing on disk, and the files behind it."
      />

      <KpiGrid
        items={[
          { label: "Used on disk", value: atLeast(disk.bytes), icon: "database", color: "#3b82f6" },
          { label: "Held by projects", value: formatBytes(projectBytes), icon: "briefcase", color: "#10b981" },
          { label: "Project files", value: String(projectFiles), icon: "folder", color: "#8b5cf6" },
          { label: "Everything else", value: atLeast(untracked + other.bytes + trashed.bytes), icon: "pie", color: "#f59e0b" },
        ]}
      />

      <Section
        title="Storage by project"
        subtitle="Open a project to browse its files and delete what you no longer need."
      >
        <StorageTable rows={rows} />
      </Section>

      <Section title="Not in the table above" subtitle="Disk these projects aren't responsible for.">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="In the Trash"
            value={formatBytes(trashed.bytes)}
            hint={
              trashed.files === 0
                ? "Nothing waiting to be purged."
                : `${trashed.files} file${trashed.files === 1 ? "" : "s"} on deleted projects. Emptying the Trash frees this.`
            }
          />
          <Stat
            label="Announcements & leave"
            value={formatBytes(other.bytes)}
            hint={
              other.files === 0
                ? "No attachments on announcements or leave requests."
                : `${other.files} file${other.files === 1 ? "" : "s"}, managed from those modules.`
            }
          />
          <Stat
            label="Untracked"
            value={atLeast(untracked)}
            hint="Employee documents, profile photos and the company logo — plus anything an interrupted delete left behind."
          />
        </dl>
        {disk.truncated && (
          <p className="mt-4 text-xs text-muted">
            The folder holds more files than this page walks in one pass, so the disk figures are a
            floor rather than a total. The per-project sizes above are unaffected — they come from
            the database.
          </p>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-canvas p-4 ring-1 ring-inset ring-line">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="font-display mt-1 text-lg font-bold text-content">{value}</dd>
      <p className="mt-1 text-xs text-faint">{hint}</p>
    </div>
  );
}
