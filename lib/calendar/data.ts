import "server-only";
import { prisma } from "@/lib/db";

export type AwayEntry = {
  name: string;
  kind: "LEAVE" | "WFH";
  type: string | null;
  isHalfDay: boolean;
};
export type DayCell = { holiday?: string; away: AwayEntry[]; announcements: string[] };
export type MonthData = {
  byDay: Record<string, DayCell>;
  announcements: { id: string; title: string; body: string | null; dateISO: string; authorId: string | null }[];
  holidays: { dateISO: string; name: string }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
function cell(byDay: Record<string, DayCell>, key: string): DayCell {
  return (byDay[key] ??= { away: [], announcements: [] });
}

/** Holidays, approved leave/WFH, and announcements for the given month. */
export async function getMonthCalendar(
  companyId: string,
  year: number,
  month0: number,
): Promise<MonthData> {
  const start = new Date(Date.UTC(year, month0, 1));
  const end = new Date(Date.UTC(year, month0 + 1, 1));

  const [holidays, announcements, away] = await Promise.all([
    prisma.holiday.findMany({
      where: { companyId, date: { gte: start, lt: end } },
      select: { date: true, name: true },
    }),
    prisma.announcement.findMany({
      where: { companyId, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
      select: { id: true, title: true, body: true, date: true, authorId: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        companyId,
        status: "HR_APPROVED",
        startDate: { lt: end },
        endDate: { gte: start },
      },
      select: {
        kind: true,
        isHalfDay: true,
        startDate: true,
        endDate: true,
        employee: { select: { fullName: true } },
        leaveType: { select: { name: true } },
      },
    }),
  ]);

  const byDay: Record<string, DayCell> = {};

  for (const h of holidays) cell(byDay, iso(h.date)).holiday = h.name;
  for (const a of announcements) cell(byDay, iso(a.date)).announcements.push(a.title);

  for (const r of away) {
    const from = r.startDate < start ? start : r.startDate;
    const to = r.endDate >= end ? new Date(end.getTime() - 86_400_000) : r.endDate;
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
      cell(byDay, iso(d)).away.push({
        name: r.employee.fullName,
        kind: r.kind,
        type: r.leaveType?.name ?? null,
        isHalfDay: r.isHalfDay,
      });
    }
  }

  return {
    byDay,
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      dateISO: iso(a.date),
      authorId: a.authorId,
    })),
    holidays: holidays.map((h) => ({ dateISO: iso(h.date), name: h.name })),
  };
}
