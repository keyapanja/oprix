import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { noteHref, formatNoteTime, type ClientNote } from "@/lib/notifications/categories";

export const metadata: Metadata = { title: "Notifications · Oprix" };

export default async function NotificationsPage() {
  const session = await requirePage(); // any signed-in user
  const canSend = await hasPermission(session.companyId, session.role, "employee:manage");

  const rows = await prisma.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, title: true, body: true, type: true, meta: true, createdAt: true, isRead: true },
  });

  const notes: ClientNote[] = rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.type,
    href: noteHref(n.type, n.meta),
    time: formatNoteTime(n.createdAt),
    isRead: n.isRead,
  }));

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${notes.length} ${notes.length === 1 ? "notification" : "notifications"}.`}
        action={
          <div className="flex items-center gap-2">
            {canSend && (
              <Link href="/notifications/send">
                <Button>
                  <Icon name="bell" className="size-4" />
                  Send notification
                </Button>
              </Link>
            )}
            <Link href="/profile/notifications">
              <Button variant="secondary">
                <Icon name="bell" className="size-4" />
                Notification settings
              </Button>
            </Link>
          </div>
        }
      />
      <NotificationsList notes={notes} />
    </>
  );
}
