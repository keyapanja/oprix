import { redirect } from "next/navigation";
import { requirePortal } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { companyHasPortalForms } from "@/lib/forms/data";
import { PortalHeader } from "@/components/portal/portal-header";

// The client portal is a separate shell from the internal app: no sidebar,
// punch-in, or timers — and every route under it is scoped to one client.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortal();

  const client = await prisma.client.findFirst({
    where: { id: session.clientId, companyId: session.companyId, deletedAt: null },
    select: { name: true, companyName: true, company: { select: { name: true } } },
  });
  // Account points at a missing/removed client → treat as signed out.
  if (!client) redirect("/logout");

  const companyName = client.company?.name ?? "Oprix";
  const clientName = client.companyName || client.name;
  const showForms = await companyHasPortalForms(session.companyId);

  return (
    <div className="min-h-dvh bg-canvas">
      <PortalHeader companyName={companyName} clientName={clientName} email={session.email} showForms={showForms} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="animate-rise">{children}</div>
      </main>
    </div>
  );
}
