import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { nowInZone, dateAtUTC, timeHHMM } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { PunchCard } from "@/components/attendance/punch-card";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await requireSession();
  const canViewReports = await hasPermission(session.companyId, session.role, "report:view");
  const now = new Date();
  const name = session.email.split("@")[0];

  // Self-service punch state for users with an employee profile.
  let punch:
    | { in: string | null; out: string | null; tz: string; shiftStart: string | null; grace: number }
    | null = null;
  if (session.employeeId) {
    const [company, employee] = await Promise.all([
      prisma.company.findUnique({ where: { id: session.companyId }, select: { timezone: true } }),
      prisma.employee.findUnique({
        where: { id: session.employeeId },
        select: { workShift: { select: { startTime: true, graceMinutes: true } } },
      }),
    ]);
    const tz = company?.timezone ?? "Asia/Kolkata";
    const { dateISO } = nowInZone(tz);
    const att = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: session.employeeId, date: dateAtUTC(dateISO) } },
      select: { clockIn: true, clockOut: true },
    });
    punch = {
      in: att?.clockIn ? timeHHMM(att.clockIn) : null,
      out: att?.clockOut ? timeHHMM(att.clockOut) : null,
      tz,
      shiftStart: employee?.workShift?.startTime ?? null,
      grace: employee?.workShift?.graceMinutes ?? 0,
    };
  }

  // Company-wide stats are only for management roles.
  let stats: { label: string; value: number; icon: string; href: string; grad: string }[] = [];
  if (canViewReports) {
    const where = { companyId: session.companyId };
    const [employees, departments, activeProjects, clients] = await Promise.all([
      prisma.employee.count({ where: { ...where, deletedAt: null } }),
      prisma.department.count({ where }),
      prisma.project.count({ where: { ...where, deletedAt: null, status: "ACTIVE" } }),
      prisma.client.count({ where: { ...where, deletedAt: null } }),
    ]);
    stats = [
      { label: "Employees", value: employees, icon: "users", href: "/employees", grad: "linear-gradient(135deg,#2dd4bf,#0d9488)" },
      { label: "Active projects", value: activeProjects, icon: "briefcase", href: "/projects", grad: "linear-gradient(135deg,#10b981,#059669)" },
      { label: "Clients", value: clients, icon: "userGroup", href: "/clients", grad: "linear-gradient(135deg,#f59e0b,#ea580c)" },
      { label: "Departments", value: departments, icon: "building", href: "/organization", grad: "linear-gradient(135deg,#fb7185,#e11d48)" },
    ];
  }

  return (
    <>
      {/* Hero */}
      <div className="gradient-mesh relative mb-8 overflow-hidden rounded-3xl text-white shadow-brand ring-1 ring-white/10">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            maskImage: "linear-gradient(to left, black, transparent 72%)",
            WebkitMaskImage: "linear-gradient(to left, black, transparent 72%)",
          }}
        />
        <svg className="pointer-events-none absolute -right-16 -top-24 size-96 text-white/10" viewBox="0 0 200 200" fill="none" aria-hidden="true">
          <circle cx="100" cy="100" r="32" stroke="currentColor" />
          <circle cx="100" cy="100" r="56" stroke="currentColor" />
          <circle cx="100" cy="100" r="80" stroke="currentColor" />
          <circle cx="100" cy="100" r="99" stroke="currentColor" />
        </svg>
        <div className="animate-blob pointer-events-none absolute -right-6 top-0 size-48 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="animate-blob animation-delay-2 pointer-events-none absolute -bottom-16 right-40 size-40 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/25" />

        <div className="relative z-10 px-8 py-9">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur">
            <Icon name="calendar" className="size-3.5" />
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting(now.getHours())}, <span className="capitalize">{name}</span>
            <span className="ml-1 inline-block">👋</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-white/75">
            {canViewReports
              ? "Here's what's happening across your organization today."
              : "Here's your day at a glance — punch in to start your session."}
          </p>
        </div>
      </div>

      {/* Self-service attendance */}
      {punch && (
        <PunchCard
          initialIn={punch.in}
          initialOut={punch.out}
          timeZone={punch.tz}
          shiftStart={punch.shiftStart}
          graceMinutes={punch.grace}
        />
      )}

      {/* Stats (management) */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href}>
              <Card hover className="p-5">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundImage: s.grad }}>
                    <Icon name={s.icon} className="size-6" />
                  </span>
                  <Icon name="chart" className="size-5 text-faint" />
                </div>
                <div className="font-display mt-4 text-3xl font-bold tracking-tight text-content">{s.value}</div>
                <div className="mt-0.5 text-sm font-medium text-muted">{s.label}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Getting started (management) */}
      {canViewReports && (
        <Card className="relative mt-6 overflow-hidden p-7">
          <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-accent-soft blur-3xl" />
          <div className="relative">
            <h2 className="text-lg font-semibold text-content">Getting started</h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              Set up your organization structure, then add your people to bring Operix to life.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/organization" className="gradient-brand-strong inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-brand transition-all hover:brightness-110 active:scale-[0.98]">
                <Icon name="building" className="size-4" />
                Set up organization
              </Link>
              <Link href="/employees" className="inline-flex items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm font-medium text-content shadow-sm ring-1 ring-inset ring-line-strong transition-all hover:bg-canvas active:scale-[0.98]">
                <Icon name="users" className="size-4" />
                Manage employees
              </Link>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
