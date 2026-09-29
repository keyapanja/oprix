import type { Metadata } from "next";
import { requirePortal } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { PortalProfileForm } from "@/components/portal/portal-profile-form";
import { ChangePasswordForm } from "@/components/profile/change-password-form";

export const metadata: Metadata = { title: "My profile · Oprix" };

export default async function PortalProfilePage() {
  const session = await requirePortal();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      email: true,
      nickname: true,
      avatarUrl: true,
      bio: true,
      phone: true,
      dateOfBirth: true,
      client: { select: { name: true, companyName: true } },
    },
  });
  if (!user) return null;

  const clientName = user.client?.companyName || user.client?.name || "";
  const displayName = user.nickname || user.email;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-content">My profile</h1>
        <p className="mt-1 text-sm text-muted">
          How you appear in this portal. Only your own team and {clientName ? "the " : ""}
          {clientName || "the"} account&rsquo;s project team can see it.
        </p>
      </header>

      <Card className="p-6">
        <div className="mb-6 flex items-center gap-4 border-b border-line pb-5">
          <Avatar name={displayName} src={user.avatarUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-content">{displayName}</h2>
            <p className="truncate text-sm text-muted">{user.email}</p>
            {clientName && <p className="truncate text-sm text-muted">{clientName}</p>}
          </div>
        </div>

        <PortalProfileForm
          displayName={displayName}
          initial={{
            nickname: user.nickname ?? "",
            bio: user.bio ?? "",
            phone: user.phone ?? "",
            dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : "",
            avatarUrl: user.avatarUrl ?? "",
          }}
        />
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-content">Password</h2>
        <p className="mb-5 mt-1 text-sm text-muted">Change the password you use to sign in.</p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
