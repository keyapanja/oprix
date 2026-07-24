import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate } from "@/lib/format";
import { EmergencyContactForm } from "@/components/employees/emergency-contact-form";
import { DeleteEmployeeButton } from "@/components/employees/delete-employee-button";
import { ResendInvite } from "@/components/employees/resend-invite";
import { EmployeeRole } from "@/components/employees/employee-role";
import { AppraisalEdit } from "@/components/employees/appraisal-edit";
import { computeBalances } from "@/lib/leave/balance";
import { ROLE_LABELS } from "@/lib/auth/can";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Employee · Oprix" };

/** Compact stat tile — a Link when the viewer can open the target, else static. */
function StatCard({ href, label, value, accent }: { href: string | null; label: string; value: number; accent?: string }) {
  const inner = (
    <>
      <p className={cn("text-2xl font-semibold leading-none", accent ?? "text-content")}>{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </>
  );
  const cls = "block rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-inset ring-line transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-surface hover:ring-brand-500/40")}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage("employee:read");
  const canManage = await hasPermission(session.companyId, session.role, "employee:manage");
  const canManageRoles = await hasPermission(session.companyId, session.role, "roles:manage");
  const canViewTasks = await hasPermission(session.companyId, session.role, "task:manage");
  const canViewProjects = await hasPermission(session.companyId, session.role, "project:manage");
  const canManageLeave = await hasPermission(session.companyId, session.role, "leave:manage");

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    include: {
      department: { select: { name: true } },
      designation: { select: { name: true } },
      manager: { select: { id: true, fullName: true } },
      workShift: { select: { name: true, startTime: true, endTime: true } },
      location: { select: { name: true } },
      user: { select: { id: true, passwordHash: true, role: true } },
      emergencyContacts: true,
    },
  });

  if (!employee) notFound();

  // Work summary: tasks assigned to this person + their leave balances.
  const [assignedTasks, balances, primaryServices] = await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null,
        project: { companyId: session.companyId, deletedAt: null },
        assignees: { some: { employeeId: id } },
      },
      select: { status: true, dueDate: true, submittedAt: true, completedAt: true },
    }),
    computeBalances(session.companyId, id, { includeWfh: true }),
    // Projects where this person is the PRIMARY assignee (not just a collaborator
    // on a few tasks) — one row per project-service they lead.
    prisma.projectService.findMany({
      where: { primaryAssigneeId: id, project: { companyId: session.companyId, deletedAt: null } },
      select: { project: { select: { id: true, name: true } } },
    }),
  ]);

  const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const stat = { total: assignedTasks.length, todo: 0, inProgress: 0, inReview: 0, delivered: 0, onTime: 0, delayed: 0 };
  for (const t of assignedTasks) {
    switch (t.status) {
      case "TODO":
      case "HOLD":
        stat.todo++;
        break;
      case "IN_PROGRESS":
      case "REDO":
        stat.inProgress++;
        break;
      case "REVIEW":
      case "CLIENT_REVIEW":
        stat.inReview++;
        break;
      case "COMPLETED": {
        stat.delivered++;
        const due = isoDate(t.dueDate);
        const del = isoDate(t.submittedAt) ?? isoDate(t.completedAt);
        if (due && del) {
          if (del <= due) stat.onTime++;
          else stat.delayed++;
        }
        break;
      }
    }
  }
  const projMap = new Map<string, string>();
  for (const ps of primaryServices) projMap.set(ps.project.id, ps.project.name);
  const projects = [...projMap]
    .map(([pid, name]) => ({ id: pid, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const account: "active" | "pending" | "none" = !employee.user
    ? "none"
    : employee.user.passwordHash
      ? "active"
      : "pending";

  const initials = employee.fullName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const details: { label: string; value: string }[] = [
    { label: "Email", value: employee.email },
    { label: "Phone", value: employee.phone ?? "—" },
    { label: "Joining date", value: formatDate(employee.joiningDate) },
    { label: "Date of birth", value: formatDate(employee.dateOfBirth) },
    { label: "Employment type", value: humanizeEnum(employee.employmentType) },
    {
      label: "Probation",
      value: employee.probationMonths
        ? `${humanizeEnum(employee.probationStatus)} · ${employee.probationMonths} months`
        : humanizeEnum(employee.probationStatus),
    },
    { label: "Work location", value: employee.location?.name ?? "—" },
    {
      label: "Work shift",
      value: employee.workShift
        ? `${employee.workShift.name} (${employee.workShift.startTime}–${employee.workShift.endTime})`
        : "—",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <BackLink href="/employees">Back to employees</BackLink>
      </div>

      {/* Header */}
      <Card className="mb-6 p-6">
        <div className="flex items-start gap-4">
          <span className="gradient-brand flex size-16 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-semibold text-white shadow-brand">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-content">{employee.fullName}</h1>
              <Badge tone={employee.probationStatus === "CONFIRMED" ? "green" : "amber"}>
                {humanizeEnum(employee.probationStatus)}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {employee.designation?.name ?? "No designation"}
              {employee.department ? ` · ${employee.department.name}` : ""}
            </p>
            <p className="mt-1 text-xs text-faint">
              {employee.employeeCode}
              {employee.manager ? ` · Reports to ${employee.manager.fullName}` : ""}
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-2">
              <Link href={`/employees/${employee.id}/edit`}>
                <Button variant="secondary" size="sm">
                  <Icon name="pencil" className="size-4" />
                  Edit
                </Button>
              </Link>
              <DeleteEmployeeButton id={employee.id} name={employee.fullName} />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <span className="text-sm font-medium text-muted">Account</span>
          <Badge tone={account === "active" ? "green" : account === "pending" ? "amber" : "gray"}>
            {account === "active" ? "Active" : account === "pending" ? "Invite pending" : "No login"}
          </Badge>
          {employee.user && (
            <>
              <span className="ml-2 text-sm font-medium text-muted">Role</span>
              {canManageRoles && employee.user.id !== session.userId ? (
                <EmployeeRole
                  employeeId={employee.id}
                  role={employee.user.role}
                  canGrantSuperAdmin={session.role === "SUPER_ADMIN"}
                />
              ) : (
                <Badge tone="gray">{ROLE_LABELS[employee.user.role] ?? humanizeEnum(employee.user.role)}</Badge>
              )}
            </>
          )}
          {canManage && account !== "active" && (
            <div className="ml-auto">
              <ResendInvite employeeId={employee.id} />
            </div>
          )}
        </div>
      </Card>

      {/* Tasks summary */}
      <Card className="mb-6">
        <CardHeader
          title="Tasks"
          description={`${stat.total} assigned in total`}
          action={canViewTasks ? <Link href={`/tasks?assignee=${employee.id}`} className="text-sm font-medium text-accent-strong hover:underline">View all</Link> : undefined}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard href={canViewTasks ? `/tasks?assignee=${employee.id}&status=TODO` : null} label="To do" value={stat.todo} />
            <StatCard href={canViewTasks ? `/tasks?assignee=${employee.id}&status=IN_PROGRESS` : null} label="In progress" value={stat.inProgress} accent="text-blue-600 dark:text-blue-400" />
            <StatCard href={canViewTasks ? `/tasks?assignee=${employee.id}&status=REVIEW` : null} label="In review" value={stat.inReview} accent="text-amber-600 dark:text-amber-400" />
            <StatCard href={canViewTasks ? `/tasks?assignee=${employee.id}&status=COMPLETED` : null} label="Delivered" value={stat.delivered} accent="text-emerald-600 dark:text-emerald-400" />
          </div>
          {stat.delivered > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="text-muted">On time <span className="font-semibold text-content">{stat.onTime}</span></span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                <span className="text-muted">Delayed <span className="font-semibold text-content">{stat.delayed}</span></span>
              </span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Projects + Leave */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-baseline gap-2">
                Projects
                <span className="text-xs font-normal text-muted">
                  {projects.length} {projects.length === 1 ? "project" : "projects"}
                </span>
              </span>
            }
          />
          <CardBody>
            {projects.length === 0 ? (
              <p className="text-sm text-muted">Not on any projects yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projects.map((p) =>
                  canViewProjects ? (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="rounded-lg bg-canvas px-2.5 py-1.5 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface hover:text-accent-strong"
                    >
                      {p.name}
                    </Link>
                  ) : (
                    <span key={p.id} className="rounded-lg bg-canvas px-2.5 py-1.5 text-sm font-medium text-content ring-1 ring-inset ring-line">
                      {p.name}
                    </span>
                  ),
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Leave"
            action={
              canManageLeave ? (
                <Link
                  href={`/leave/requests?employee=${employee.id}`}
                  className="text-sm font-medium text-accent-strong hover:underline"
                >
                  View requests
                </Link>
              ) : undefined
            }
          />
          <CardBody>
            {balances.length === 0 ? (
              <p className="text-sm text-muted">No leave types configured.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {[...balances]
                  .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name))
                  .map((b) => {
                    const per = b.period === "MONTH" ? "this month" : "this year";
                    const pct =
                      b.unlimited || b.allowance <= 0 ? 0 : Math.min(100, Math.round((b.used / b.allowance) * 100));
                    return (
                      <div key={b.typeId} className="rounded-xl border border-line bg-canvas p-3">
                        <p className="truncate text-xs font-medium text-content" title={b.name}>{b.name}</p>
                        {b.unlimited ? (
                          <>
                            <p className="mt-1.5 text-xl font-semibold leading-none text-content">
                              {b.used}
                              <span className="ml-1 text-xs font-normal text-muted">taken</span>
                            </p>
                            <p className="mt-1.5 text-[11px] text-muted">No fixed limit · {per}</p>
                          </>
                        ) : (
                          <>
                            <p className={cn("mt-1.5 text-xl font-semibold leading-none", b.remaining < 0 ? "text-red-600 dark:text-red-400" : "text-content")}>
                              {b.remaining}
                              <span className="ml-1 text-xs font-normal text-muted">of {b.allowance} left</span>
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                              <div
                                className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : "gradient-brand")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="mt-1.5 text-[11px] text-muted">{b.used} taken · {per}</p>
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Details */}
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-faint">
                    {d.label}
                  </dt>
                  <dd className="mt-0.5 text-sm text-content">{d.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-faint">Last appraisal</p>
              <div className="mt-1">
                <AppraisalEdit employeeId={employee.id} initial={isoDate(employee.lastAppraisalAt)} canEdit={canManage} />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Emergency contacts */}
        <Card>
          <CardHeader title="Emergency contacts" />
          <CardBody className="space-y-4">
            {employee.emergencyContacts.length === 0 ? (
              <p className="text-sm text-muted">No contacts added.</p>
            ) : (
              <ul className="divide-y divide-line">
                {employee.emergencyContacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-content">{c.name}</p>
                      <p className="text-xs text-muted">{c.relationship ?? "—"}</p>
                    </div>
                    <span className="text-sm text-muted">{c.phone}</span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div className="border-t border-line pt-4">
                <EmergencyContactForm employeeId={employee.id} />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
