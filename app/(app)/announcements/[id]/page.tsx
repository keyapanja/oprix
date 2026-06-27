import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { renderMarkdown } from "@/lib/kb/markdown";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Announcement · Oprix" };

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePage();

  const ann = await prisma.announcement.findFirst({
    where: { id, companyId: session.companyId },
    select: {
      title: true,
      body: true,
      date: true,
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true } },
    },
  });

  const images = ann?.attachments.filter((a) => a.mimeType?.startsWith("image/")) ?? [];
  const otherFiles = ann?.attachments.filter((a) => !a.mimeType?.startsWith("image/")) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <BackLink href="/calendar">Calendar</BackLink>
      </div>

      {ann ? (
        <Card className="p-6">
          <div className="flex items-center gap-2 text-xs font-medium text-accent-strong">
            <Icon name="calendarDays" className="size-4" />
            <span>{formatDate(ann.date)}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-content">{ann.title}</h1>
          {ann.body ? (
            <div
              className="mt-4 text-[15px] leading-relaxed text-content [&_a]:text-accent-strong [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-brand-500 [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_code]:rounded [&_code]:bg-canvas [&_code]:px-1 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(ann.body) }}
            />
          ) : (
            <p className="mt-4 text-sm text-muted">No additional details.</p>
          )}

          {ann.attachments.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Attachments</p>
              {images.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {images.map((a) => (
                    <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/files/${a.id}`}
                        alt={a.fileName}
                        className="h-32 w-32 rounded-lg object-cover ring-1 ring-inset ring-line transition-opacity hover:opacity-90"
                      />
                    </a>
                  ))}
                </div>
              )}
              <ul className="space-y-1">
                {otherFiles.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/files/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
                    >
                      <Icon name="download" className="size-4 shrink-0" />
                      {a.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <Card className="px-5 py-16 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-canvas text-faint">
            <Icon name="bell" className="size-6" />
          </span>
          <h1 className="text-lg font-semibold text-content">Announcement not available</h1>
          <p className="mt-1.5 text-sm text-muted">
            This announcement has been deleted or is no longer available.
          </p>
          <Link href="/calendar" className="mt-4 inline-block text-sm font-medium text-accent-strong hover:underline">
            Go to the calendar →
          </Link>
        </Card>
      )}
    </div>
  );
}
