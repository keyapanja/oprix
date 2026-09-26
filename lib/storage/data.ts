import "server-only";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { folderUsage, fileSizes, type DiskUsage } from "@/lib/uploads";

/** One project's slice of the uploads folder. */
export type ProjectStorageRow = {
  id: string;
  name: string;
  client: string | null;
  status: ProjectStatus;
  /** Uploaded files (link attachments cost nothing on disk and are counted apart). */
  files: number;
  links: number;
  bytes: number;
};

export type StorageOverview = {
  rows: ProjectStorageRow[];
  /** Total across the projects above. */
  projectBytes: number;
  projectFiles: number;
  /** Files still on disk for projects that have been moved to the Trash. */
  trashed: { files: number; bytes: number };
  /** Announcement and leave-request attachments — real disk, no project. */
  other: { files: number; bytes: number };
  /** Ground truth: what `uploads/` actually weighs. */
  disk: DiskUsage;
};

type SizeBucket = { files: number; links: number; bytes: number };

const emptyBucket = (): SizeBucket => ({ files: 0, links: 0, bytes: 0 });

function add(bucket: SizeBucket, fileKey: string | null, sizeBytes: number | null): void {
  if (fileKey) {
    bucket.files += 1;
    bucket.bytes += sizeBytes ?? 0;
  } else {
    bucket.links += 1;
  }
}

/**
 * Storage used per project, for the admin console.
 *
 * Sizes come from `Attachment.sizeBytes` (recorded at upload) rather than from
 * stat-ing every file, so this stays one pass over the table no matter how big
 * the folder is. `disk` is the one figure read from the filesystem, and the gap
 * between the two is what the page surfaces as untracked.
 */
export async function getStorageOverview(companyId: string): Promise<StorageOverview> {
  const [projects, projectAtts, otherAtts, disk] = await Promise.all([
    prisma.project.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, client: { select: { name: true } } },
    }),
    // Everything hanging off a project, directly or through one of its tasks —
    // including trashed ones, whose files are still on disk until Trash is emptied.
    prisma.attachment.findMany({
      where: { OR: [{ project: { companyId } }, { task: { project: { companyId } } }] },
      select: {
        fileKey: true,
        sizeBytes: true,
        projectId: true,
        task: { select: { projectId: true } },
      },
    }),
    prisma.attachment.findMany({
      where: { OR: [{ announcement: { companyId } }, { leaveRequest: { companyId } }] },
      select: { fileKey: true, sizeBytes: true },
    }),
    folderUsage(),
  ]);

  const live = new Set(projects.map((p) => p.id));
  const byProject = new Map<string, SizeBucket>();
  const trashed = { files: 0, bytes: 0 };

  for (const a of projectAtts) {
    const pid = a.projectId ?? a.task?.projectId;
    if (!pid) continue;
    if (!live.has(pid)) {
      // The project itself is in the Trash — roll it up rather than dropping it,
      // or the totals would silently under-report what's on disk.
      if (a.fileKey) {
        trashed.files += 1;
        trashed.bytes += a.sizeBytes ?? 0;
      }
      continue;
    }
    let bucket = byProject.get(pid);
    if (!bucket) byProject.set(pid, (bucket = emptyBucket()));
    add(bucket, a.fileKey, a.sizeBytes);
  }

  const other = { files: 0, bytes: 0 };
  for (const a of otherAtts) {
    if (!a.fileKey) continue;
    other.files += 1;
    other.bytes += a.sizeBytes ?? 0;
  }

  const rows: ProjectStorageRow[] = projects.map((p) => {
    const b = byProject.get(p.id) ?? emptyBucket();
    return {
      id: p.id,
      name: p.name,
      client: p.client?.name ?? null,
      status: p.status,
      files: b.files,
      links: b.links,
      bytes: b.bytes,
    };
  });

  return {
    rows,
    projectBytes: rows.reduce((s, r) => s + r.bytes, 0),
    projectFiles: rows.reduce((s, r) => s + r.files, 0),
    trashed,
    other,
    disk,
  };
}

/** One uploaded file (or link) belonging to a project. */
export type AssetRow = {
  id: string;
  fileName: string;
  title: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** An image pasted into a comment or description — not shown in the Attachments panel. */
  inline: boolean;
  createdAt: string;
  uploaderName: string;
  /** Null when the file hangs off the project itself rather than a task. */
  taskId: string | null;
  taskName: string | null;
  taskTrashed: boolean;
  /** The row survives but the file behind it doesn't — deleting it frees nothing. */
  missing: boolean;
};

export type ProjectAssets = {
  project: { id: string; name: string; client: string | null; status: ProjectStatus };
  assets: AssetRow[];
};

/**
 * Every asset a project is responsible for: its own attachments plus those on
 * all of its tasks, trashed tasks included (their files are still on disk).
 * Returns null when the project doesn't exist in this company.
 */
export async function getProjectAssets(
  companyId: string,
  projectId: string,
): Promise<ProjectAssets | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId, deletedAt: null },
    select: { id: true, name: true, status: true, client: { select: { name: true } } },
  });
  if (!project) return null;

  const atts = await prisma.attachment.findMany({
    where: { OR: [{ projectId }, { task: { projectId } }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      title: true,
      url: true,
      fileKey: true,
      mimeType: true,
      sizeBytes: true,
      inline: true,
      createdAt: true,
      uploadedBy: true,
      task: { select: { id: true, name: true, deletedAt: true } },
    },
  });

  // Uploader ids are raw userIds on the row; resolve them in one go.
  const userIds = [...new Set(atts.map((a) => a.uploadedBy).filter(Boolean))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, nickname: true, employee: { select: { fullName: true } } },
      })
    : [];
  const nameById = new Map(
    users.map((u) => [u.id, u.employee?.fullName || u.nickname || u.email] as const),
  );

  const onDisk = await fileSizes(atts.map((a) => a.fileKey).filter((k): k is string => !!k));

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      client: project.client?.name ?? null,
    },
    assets: atts.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      title: a.title,
      url: a.url,
      mimeType: a.mimeType,
      sizeBytes: a.fileKey ? a.sizeBytes : null,
      inline: a.inline,
      createdAt: a.createdAt.toISOString(),
      uploaderName: nameById.get(a.uploadedBy) ?? "—",
      taskId: a.task?.id ?? null,
      taskName: a.task?.name ?? null,
      taskTrashed: !!a.task?.deletedAt,
      missing: !!a.fileKey && !onDisk.has(a.fileKey),
    })),
  };
}
