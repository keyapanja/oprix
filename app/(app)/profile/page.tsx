import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { roleLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { employeeLiveStatus } from "@/lib/profile/status";

export const metadata: Metadata = { title: "My profile · Operix" };

export default async function ProfilePage() {
  const session = await requirePage();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      email: true,
      role: true,
      nickname: true,
      avatarUrl: true,
      bio: true,
      employee: {
        select: {
          id: true,
          fullName: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
        },
      },
    },
  });
  if (!user) return null;

  const displayName = user.nickname || user.employee?.fullName || user.email;
  const fullName = user.employee?.fullName ?? displayName; // for avatar initials (first + last)
  const status = user.employee ? await employeeLiveStatus(user.employee.id, session.companyId) : null;
  const subtitle = user.employee
    ? [user.employee.designation?.name, user.employee.department?.name].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" description="Update how you appear across Operix." />
      <Card className="p-6">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-4">
            <Avatar name={fullName} src={user.avatarUrl} size="lg" status={status} />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-content">{displayName}</h2>
              <p className="text-sm text-muted">
                {user.email} · {roleLabel(user.role)}
              </p>
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
          </div>
          {status && <Badge tone={status === "active" ? "green" : "gray"}>{status === "active" ? "Active" : "Away"}</Badge>}
        </div>

        <ProfileEditForm
          initial={{ nickname: user.nickname ?? "", avatarUrl: user.avatarUrl ?? "", bio: user.bio ?? "" }}
          fullName={fullName}
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
