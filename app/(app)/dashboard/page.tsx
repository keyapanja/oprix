import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { nowInZone, dateAtUTC, timeHHMM } from "@/lib/dates";
import { getCompanyTimezone } from "@/lib/cache";
import { humanizeEnum } from "@/lib/format";
import { PRIORITY_TONE, TASK_STATUS_TONE, TASK_STATUS_LABEL } from "@/lib/status";
import { categorize, CATEGORY_STYLES, noteHref, formatNoteTime } from "@/lib/notifications/categories";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { PunchCard } from "@/components/attendance/punch-card";
import { cn } from "@/lib/cn";

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

  const tz = await getCompanyTimezone(session.companyId);
  const nowZ = nowInZone(tz);
  const todayUTC = dateAtUTC(nowZ.dateISO);
  const hour = Number(nowZ.time.slice(0, 2));

  // Self-service punch state for users with an employee profile.
  let punch:
    | { in: string | null; out: string | null; tz: string; shiftStart: string | null; grace: number }
    | null = null;
  if (session.employeeId) {
    const [employee, att] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: session.employeeId },
        select: { workShift: { select: { startTime: true, graceMinutes: true } } },
      }),
      prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: session.employeeId, date: todayUTC } },
        select: { clockIn: true, clockOut: true },
      }),
    ]);
    punch = {
      in: att?.clockIn ? timeHHMM(att.clockIn) : null,
      out: att?.clockOut ? timeHHMM(att.clockOut) : null,
      tz,
      shiftStart: employee?.workShift?.startTime ?? null,
      grace: employee?.workShift?.graceMinutes ?? 0,
    };
  }

  // My tasks due today (assignees only) + my latest notifications.
  const [tasksDue, notesRaw] = await Promise.all([
    session.employeeId
      ? prisma.task.findMany({
          where: {
            project: { companyId: session.companyId, deletedAt: null },
            dueDate: todayUTC,
            status: { not: "COMPLETED" },
            assignees: { some: { employeeId: session.employeeId } },
          },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          take: 6,
          select: { id: true, name: true, status: true, priority: true, project: { select: { name: true } } },
        })
      : Promise.resolve([]),
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, title: true, body: true, isRead: true, createdAt: true, meta: true },
    }),
  ]);

  const notes = notesRaw.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    href: noteHref(n.type, n.meta),
    time: formatNoteTime(n.createdAt),
    isRead: n.isRead,
    style: CATEGORY_STYLES[categorize(n.type)],
  }));

  // Subtitle adapts to where the user is in their day (no "punch in" once done).
  const subtitle = canViewReports
    ? "Here's what's happening across your organization today."
    : !punch
      ? "Here's your day at a glance."
      : punch.in && punch.out
        ? "You're all wrapped up for today — nicely done."
        : punch.in
          ? "Your session is running — here's your day at a glance."
          : "Here's your day at a glance — punch in to start your session.";

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
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz })}
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting(hour)}, <span className="capitalize">{name}</span>
            <span className="ml-1 inline-block">👋</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-white/75">{subtitle}</p>
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

      {/* Personal widgets: tasks due today + latest notifications */}
      <div className={cn("mt-6 grid grid-cols-1 gap-5", session.employeeId && "lg:grid-cols-2")}>
        {session.employeeId && (
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-content">
                <Icon name="check" className="size-4 text-accent-strong" />
                Tasks due today
              </h2>
              <Link href="/tasks?view=mine" className="text-xs font-medium text-accent-strong hover:underline">
                View all
              </Link>
            </div>
            <div className="p-3">
              {tasksDue.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted">Nothing due today. 🎉</p>
              ) : (
                <ul className="space-y-0.5">
                  {tasksDue.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-canvas">
                        <Badge tone={PRIORITY_TONE[t.priority]}>{humanizeEnum(t.priority)}</Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-content">{t.name}</p>
                          <p className="truncate text-xs text-faint">{t.project.name}</p>
                        </div>
                        <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-content">
              <Icon name="bell" className="size-4 text-accent-strong" />
              Latest notifications
            </h2>
            <Link href="/notifications" className="text-xs font-medium text-accent-strong hover:underline">
              View all
            </Link>
          </div>
          <div className="p-3">
            {notes.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted">No notifications yet.</p>
            ) : (
              <ul className={cn("grid grid-cols-1 gap-0.5", !session.employeeId && "lg:grid-cols-2 lg:gap-x-3")}>
                {notes.map((n) => {
                  const cls = "flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-canvas";
                  const inner = (
                    <>
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", n.style.soft, n.style.text)}>
                        <Icon name={n.style.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-content">{n.title}</p>
                        {n.body && <p className="truncate text-xs text-muted">{n.body}</p>}
                        <p className="mt-0.5 text-[11px] text-faint">{n.time}</p>
                      </div>
                      {!n.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />}
                    </>
                  );
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link href={n.href} className={cls}>{inner}</Link>
                      ) : (
                        <div className={cls}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

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
