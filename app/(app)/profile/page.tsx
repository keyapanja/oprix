import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { roleLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { PersonalDetailsForm } from "@/components/profile/personal-details-form";
import { ChangePasswordForm } from "@/components/profile/change-password-form";

export const metadata: Metadata = { title: "My profile · Oprix" };

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
          phone: true,
          personalEmail: true,
          dateOfBirth: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
          emergencyContacts: { select: { name: true, relationship: true, phone: true } },
        },
      },
    },
  });
  if (!user) return null;

  const displayName = user.nickname || user.employee?.fullName || user.email;
  const fullName = user.employee?.fullName ?? displayName; // for avatar initials (first + last)
  const subtitle = user.employee
    ? [user.employee.designation?.name, user.employee.department?.name].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" description="Update how you appear across Oprix." />
      <Card className="p-6">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-4">
            <Avatar name={fullName} src={user.avatarUrl} size="lg" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-content">{displayName}</h2>
              <p className="text-sm text-muted">
                {user.email} · {roleLabel(user.role)}
              </p>
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
          </div>
        </div>

        <ProfileEditForm
          initial={{ nickname: user.nickname ?? "", avatarUrl: user.avatarUrl ?? "", bio: user.bio ?? "" }}
          fullName={fullName}
        />
      </Card>

      {user.employee && (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-content">Personal details</h2>
          <p className="mb-5 mt-1 text-sm text-muted">
            Your own contact info and emergency contacts — keep these up to date yourself.
          </p>
          <PersonalDetailsForm
            initial={{
              phone: user.employee.phone ?? "",
              personalEmail: user.employee.personalEmail ?? "",
              dateOfBirth: user.employee.dateOfBirth ? user.employee.dateOfBirth.toISOString().slice(0, 10) : "",
              contacts: user.employee.emergencyContacts.map((c) => ({
                name: c.name,
                relationship: c.relationship ?? "",
                phone: c.phone,
              })),
            }}
          />
        </Card>
      )}

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-content">Password</h2>
        <p className="mb-5 mt-1 text-sm text-muted">Change the password you use to sign in.</p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
