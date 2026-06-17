import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Announcement · Operix" };

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePage();

  const ann = await prisma.announcement.findFirst({
    where: { id, companyId: session.companyId },
    select: { title: true, body: true, date: true },
  });

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
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-content">{ann.body}</p>
          ) : (
            <p className="mt-4 text-sm text-muted">No additional details.</p>
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
