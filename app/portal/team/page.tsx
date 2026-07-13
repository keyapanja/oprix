import type { Metadata } from "next";
import { requirePortal } from "@/lib/auth/guard";
import { listClientTeam } from "@/lib/portal/data";
import { TeamManager } from "@/components/portal/team-manager";

export const metadata: Metadata = { title: "Your team · Client Portal" };

export default async function PortalTeamPage() {
  const session = await requirePortal();
  const team = await listClientTeam(session.clientId, session.companyId);
  const isPrimary = team.find((m) => m.isPrimary)?.id === session.userId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-content">Your team</h1>
        <p className="mt-1 text-sm text-muted">
          People from your side who can sign in to this portal, view your projects, and raise tasks.
          {isPrimary ? " As the primary contact you can invite or remove members." : ""}
        </p>
      </div>
      <TeamManager team={team} isPrimary={isPrimary} currentUserId={session.userId} />
    </div>
  );
}
