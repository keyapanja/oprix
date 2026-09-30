import { redirect } from "next/navigation";
import { requirePortal } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { companyHasPortalForms } from "@/lib/forms/data";
import { getPortalNotifications } from "@/lib/portal/data";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalBadge } from "@/components/portal/portal-badge";
import { ServiceStatus } from "@/components/shell/service-status";
import { BUILD_ID } from "@/lib/build-id";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";

// The client portal is a separate shell from the internal app: no sidebar,
// punch-in, or timers — and every route under it is scoped to one client.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortal();

  const client = await prisma.client.findFirst({
    where: { id: session.clientId, companyId: session.companyId, deletedAt: null },
    select: {
      name: true,
      companyName: true,
      company: {
        select: {
          name: true,
          logoUrl: true,
          portalBadgeText: true,
          portalBadgeName: true,
          portalBadgeUrl: true,
        },
      },
    },
  });
  // Account points at a missing/removed client → treat as signed out.
  if (!client) redirect("/logout");

  const companyName = client.company?.name ?? "Oprix";
  const clientName = client.companyName || client.name;
  const showForms = await companyHasPortalForms(session.companyId);
  const { items: notifications, unread } = await getPortalNotifications(session.userId);
  // The header shows the signed-in person alongside the client account.
  const me = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { nickname: true, avatarUrl: true },
  });

  // The stored logoUrl points at /api/org/logo, which the proxy bounces clients
  // away from — swap in the portal-reachable route, keeping the ?v= cache-buster
  // so replacing the logo still busts it.
  const storedLogo = client.company?.logoUrl ?? null;
  const badgeLogoUrl = storedLogo
    ? `/api/portal/logo${storedLogo.includes("?") ? storedLogo.slice(storedLogo.indexOf("?")) : ""}`
    : null;

  return (
    <div className="min-h-dvh bg-canvas">
      <PortalHeader
        companyName={companyName}
        clientName={clientName}
        email={session.email}
        displayName={me?.nickname || session.email}
        avatarUrl={me?.avatarUrl ?? null}
        showForms={showForms}
        notifications={notifications}
        unread={unread}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="animate-rise">{children}</div>
      </main>
      {/* Interactive hosts — the portal is a separate shell from the internal
          app, so it needs its own toast + confirm-dialog mounts (used by the
          task edit/withdraw controls and the team manager). */}
      <Toaster />
      <ConfirmHost />
      <ServiceStatus build={BUILD_ID} />
      {/* Client portal only — the internal app never shows this. */}
      <PortalBadge
        text={client.company?.portalBadgeText ?? null}
        name={client.company?.portalBadgeName ?? null}
        url={client.company?.portalBadgeUrl ?? null}
        logoUrl={badgeLogoUrl}
      />
    </div>
  );
}
