import type { Metadata } from "next";
import Link from "next/link";
import { requirePortal } from "@/lib/auth/guard";
import { getPortalNotifications } from "@/lib/portal/data";
import { categorize, CATEGORY_STYLES } from "@/lib/notifications/categories";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { PortalMarkRead } from "@/components/portal/portal-mark-read";

export const metadata: Metadata = { title: "Notifications · Client Portal" };

export default async function PortalNotificationsPage() {
  const session = await requirePortal();
  const { items, unread } = await getPortalNotifications(session.userId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-content">Notifications</h1>
          <p className="mt-1 text-sm text-muted">
            {unread > 0 ? `${unread} unread` : "You're all caught up."}
          </p>
        </div>
        {unread > 0 && <PortalMarkRead />}
      </div>

      {items.length === 0 ? (
        <Card className="px-5 py-16 text-center text-sm text-muted">No notifications yet.</Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {items.map((n) => {
            const st = CATEGORY_STYLES[categorize(n.type)];
            const inner = (
              <div className={cn("flex gap-3 px-5 py-4", !n.isRead && "bg-accent-soft/30")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", st.soft, st.text)}>
                  <Icon name={st.icon} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                    <span className="text-[11px] text-faint">{n.time}</span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-content">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                </div>
                {n.href && <Icon name="chevronRight" className="mt-1 size-4 shrink-0 text-faint" />}
              </div>
            );
            return (
              <div key={n.id} className="transition-colors hover:bg-canvas">
                {n.href ? <Link href={n.href}>{inner}</Link> : inner}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
