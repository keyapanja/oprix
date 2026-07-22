import "server-only";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notifications/notify";
import { parseWorkWeek, isWorkingDay } from "@/lib/leave/work-week";

/** Active internal (non-client) users in a company, minus one (the applicant). */
async function internalUserIdsExcept(companyId: string, exceptUserId: string | null): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { not: "CLIENT" },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** "on leave"/"working from home" + a single-day or range phrase. */
function awayPhrase(kind: string, startISO: string, endISO: string): { noun: string; when: string } {
  const noun = kind === "WFH" ? "working from home" : "on leave";
  const when = startISO === endISO ? `on ${formatDate(startISO)}` : `from ${formatDate(startISO)} to ${formatDate(endISO)}`;
  return { noun, when };
}

/**
 * Part 1 — company-wide heads-up when a leave/WFH request is approved. Everyone
 * (except the applicant, who gets their own "approved" notice) is told the
 * person will be away on the date(s). In-app bell + Web Push only — no email.
 */
export async function broadcastLeaveApproved(opts: {
  companyId: string;
  applicantUserId: string | null;
  name: string;
  kind: string;
  startISO: string;
  endISO: string;
}): Promise<void> {
  const ids = await internalUserIdsExcept(opts.companyId, opts.applicantUserId);
  if (!ids.length) return;
  const { noun, when } = awayPhrase(opts.kind, opts.startISO, opts.endISO);
  await notify(ids, {
    type: "LEAVE_AWAY",
    title: `${opts.name} will be ${noun}`,
    body: `${opts.name} is ${noun} ${when}.`,
    meta: { team: true },
    email: false,
  });
}

/** "HH:MM" + minutes (clamped to 23:59). */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min((h || 0) * 60 + (m || 0) + mins, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Part 2 — lazy day-of notice. Once the company clock passes office start + 15
 * minutes on a working day, fan out a "<name> is on leave/WFH today" notice for
 * every approved request active today. Per-request per-day dedupe via
 * `dayNoticeKey`, claimed atomically so a cron hit + a page load can't double-send.
 * Best-effort — callers swallow errors.
 */
export async function sendLeaveDayNotices(opts: { companyId: string; tz: string }): Promise<void> {
  const { dateISO, time } = nowInZone(opts.tz);

  // Office start = the company's earliest shift start (default 09:00), + 15 min.
  const shifts = await prisma.workShift.findMany({
    where: { companyId: opts.companyId },
    select: { startTime: true },
  });
  const starts = shifts.map((s) => s.startTime).filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  const officeStart = starts[0] ?? "09:00";
  if (time < addMinutes(officeStart, 15)) return; // not yet office start + 15 min

  // Skip non-working days (weekly offs, nth-Saturday rules, holidays) — no office.
  const [company, holidayRows] = await Promise.all([
    prisma.company.findUnique({ where: { id: opts.companyId }, select: { workWeek: true } }),
    prisma.holiday.findMany({
      where: { companyId: opts.companyId, date: dateAtUTC(dateISO), deletedAt: null },
      select: { id: true },
    }),
  ]);
  const holidays = new Set(holidayRows.length ? [dateISO] : []);
  if (!isWorkingDay(dateISO, parseWorkWeek(company?.workWeek), holidays)) return;

  const today = dateAtUTC(dateISO);
  const active = await prisma.leaveRequest.findMany({
    where: {
      companyId: opts.companyId,
      status: { in: ["HR_APPROVED", "APPROVED"] },
      startDate: { lte: today },
      endDate: { gte: today },
      OR: [{ dayNoticeKey: null }, { dayNoticeKey: { not: dateISO } }],
    },
    select: {
      id: true,
      kind: true,
      employee: { select: { fullName: true, user: { select: { id: true } } } },
    },
  });

  for (const r of active) {
    // Atomic per-day claim so only one request wins today (cron vs page load).
    const claim = await prisma.leaveRequest.updateMany({
      where: { id: r.id, OR: [{ dayNoticeKey: null }, { dayNoticeKey: { not: dateISO } }] },
      data: { dayNoticeKey: dateISO },
    });
    if (claim.count !== 1) continue;

    const ids = await internalUserIdsExcept(opts.companyId, r.employee.user?.id ?? null);
    if (!ids.length) continue;
    const noun = r.kind === "WFH" ? "working from home" : "on leave";
    await notify(ids, {
      type: "LEAVE_AWAY",
      title: `${r.employee.fullName} is ${noun} today`,
      body: `${r.employee.fullName} is ${noun} today.`,
      meta: { team: true },
      email: false,
    });
  }
}
