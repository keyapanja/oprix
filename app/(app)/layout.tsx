import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listPermissions } from "@/lib/auth/permissions";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const allowed = await listPermissions(session.companyId, session.role);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar allowed={allowed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={session.email} role={session.role} />
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="animate-rise mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
