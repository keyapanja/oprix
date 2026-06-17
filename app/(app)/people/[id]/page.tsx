import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { BackLink } from "@/components/ui/back-link";
import { Avatar } from "@/components/ui/avatar";

export const metadata: Metadata = { title: "Profile · Oprix" };

export default async function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePage(); // any signed-in user can view a colleague's profile

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      service: { select: { name: true } },
      user: { select: { nickname: true, avatarUrl: true, bio: true } },
    },
  });
  if (!employee) notFound();

  const displayName = employee.user?.nickname || employee.fullName;
  const role = [employee.designation?.name, employee.department?.name].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <BackLink href="/dashboard">Back</BackLink>
      </div>
      <Card className="p-6">
        <div className="flex items-start gap-5">
          <Avatar name={employee.fullName} src={employee.user?.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-content">{displayName}</h1>
            </div>
            {employee.user?.nickname && <p className="text-sm text-muted">{employee.fullName}</p>}
            <p className="mt-1 text-sm text-muted">{role || "—"}</p>
            {employee.user?.bio && <p className="mt-3 text-sm text-content">{employee.user.bio}</p>}
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
          <div>
            <span className="text-faint">Email</span>
            <p className="font-medium text-content">{employee.email}</p>
          </div>
          {employee.phone && (
            <div>
              <span className="text-faint">Phone</span>
              <p className="font-medium text-content">{employee.phone}</p>
            </div>
          )}
          {employee.service?.name && (
            <div>
              <span className="text-faint">Service</span>
              <p className="font-medium text-content">{employee.service.name}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
