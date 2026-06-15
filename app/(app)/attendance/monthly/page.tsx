import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nowInZone } from "@/lib/dates";
import { periodLabel } from "@/lib/format";
import { getMonthlyAttendance } from "@/lib/attendance/monthly";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Monthly attendance · Operix" };

const CELL: Record<string, { cls: string; label: string }> = {
  PRESENT: { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "P" },
  ABSENT: { cls: "bg-red-500/15 text-red-700 dark:text-red-300", label: "A" },
  HALF_DAY: { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", label: "½" },
  LEAVE: { cls: "bg-brand-500/15 text-brand-700 dark:text-brand-300", label: "L" },
  HOLIDAY: { cls: "bg-slate-400/15 text-slate-600 dark:text-slate-300", label: "H" },
};
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const pad = (n: number) => String(n).padStart(2, "0");

export default async function MonthlyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await requirePage("attendance:manage");
  const sp = await searchParams;
  const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { timezone: true } });
  const todayISO = nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO;

  let year: number;
  let month: number;
  if (sp.ym && /^\d{4}-\d{2}$/.test(sp.ym)) {
    year = Number(sp.ym.slice(0, 4));
    month = Number(sp.ym.slice(5, 7));
  } else {
    year = Number(todayISO.slice(0, 4));
    month = Number(todayISO.slice(5, 7));
  }

  const { rows, dim } = await getMonthlyAttendance(session.companyId, year, month);
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  const days = Array.from({ length: dim }, (_, i) => i + 1);

  return (
    <>
      <div className="mb-3">
        <BackLink href="/attendance">Attendance</BackLink>
      </div>
      <PageHeader title="Monthly attendance" description="Attendance register for the whole month." />

      <Card className="mb-4 flex items-center justify-between p-3">
        <Link href={`/attendance/monthly?ym=${prev}`}>
          <Button variant="secondary" size="sm"><Icon name="chevronLeft" className="size-4" />Prev</Button>
        </Link>
        <span className="font-semibold text-content">{periodLabel(year, month)}</span>
        <Link href={`/attendance/monthly?ym=${next}`}>
          <Button variant="secondary" size="sm">Next<Icon name="chevronRight" className="size-4" /></Button>
        </Link>
      </Card>

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(CELL).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("flex size-5 items-center justify-center rounded text-[10px] font-semibold", v.cls)}>{v.label}</span>
            {k === "HALF_DAY" ? "Half day" : k.charAt(0) + k.slice(1).toLowerCase()}
          </span>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No employees yet.</p>
        ) : (
          <table className="border-collapse text-xs">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold text-faint">Employee</th>
                {days.map((d) => {
                  const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
                  const sun = wd === 0;
                  return (
                    <th key={d} className={cn("w-8 px-0 py-1.5 text-center font-medium", sun ? "bg-canvas text-faint" : "text-muted")}>
                      <div className="tabular-nums">{d}</div>
                      <div className="text-[9px] text-faint">{WD[wd]}</div>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center font-semibold text-emerald-600">P</th>
                <th className="px-2 py-2 text-center font-semibold text-red-600">A</th>
                <th className="px-2 py-2 text-center font-semibold text-amber-600">½</th>
                <th className="px-2 py-2 text-center font-semibold text-brand-600">L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-1.5">
                    <Link href={`/people/${r.id}`} className="font-medium text-content hover:text-accent-strong hover:underline">{r.name}</Link>
                    <div className="text-[10px] text-faint">{r.code}</div>
                  </td>
                  {r.cells.map((c) => {
                    const s = c.status ? CELL[c.status] : null;
                    return (
                      <td key={c.day} className={cn("px-0.5 py-1 text-center", c.isSunday && !s && "bg-canvas")}>
                        {s ? (
                          <span className={cn("inline-flex size-6 items-center justify-center rounded text-[10px] font-semibold", s.cls)}>{s.label}</span>
                        ) : (
                          <span className="text-faint">{c.isSunday ? "·" : ""}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center tabular-nums text-content">{r.present}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-muted">{r.absent}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-muted">{r.halfDay}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-muted">{r.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
