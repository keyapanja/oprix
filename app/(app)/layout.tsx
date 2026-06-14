import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listPermissions } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [allowed, notifications, unread] = await Promise.all([
    listPermissions(session.companyId, session.role),
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, body: true },
    }),
    prisma.notification.count({ where: { userId: session.userId, isRead: false } }),
  ]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar allowed={allowed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={session.email}
          role={session.role}
          notifications={notifications}
          unread={unread}
        />
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="animate-rise mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
