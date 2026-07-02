"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MonthData } from "@/lib/calendar/data";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { DateActionModal } from "@/components/calendar/date-action-modal";
import { AnnouncementActions } from "@/components/calendar/announcement-actions";
import { HolidayActions } from "@/components/calendar/holiday-actions";
import { CalendarDetailModal, type CalendarDetail } from "@/components/calendar/detail-modal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type Balance = {
  typeId: string;
  name: string;
  remaining: number;
  allowance: number;
  period: "MONTH" | "YEAR";
  unlimited: boolean;
  used: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function CalendarView({
  ym,
  data,
  today,
  currentYm,
  canManage,
  canApplyLeave,
  balances,
  currentUserId,
  isSuperAdmin,
}: {
  ym: string;
  data: MonthData;
  today: string;
  currentYm: string;
  canManage: boolean;
  canApplyLeave: boolean;
  balances: Balance[];
  currentUserId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const go = (next: string) => router.push(`/calendar?ym=${next}`);

  const [anchor, setAnchor] = useState<string | null>(null);
  const [hoverEnd, setHoverEnd] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<{ start: string; end: string } | null>(null);
  const [detail, setDetail] = useState<CalendarDetail | null>(null);

  const selectable = canApplyLeave || canManage;

  useEffect(() => {
    if (!selecting) return;
    function onUp() {
      if (anchor && hoverEnd) {
        const [start, end] = anchor <= hoverEnd ? [anchor, hoverEnd] : [hoverEnd, anchor];
        setSelection({ start, end });
      }
      setSelecting(false);
      setAnchor(null);
      setHoverEnd(null);
    }
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [selecting, anchor, hoverEnd]);

  const [y, m] = ym.split("-").map(Number);
  const m0 = m - 1;
  const dim = new Date(y, m0 + 1, 0).getDate();
  const lead = new Date(y, m0, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const lo = anchor && hoverEnd ? (anchor <= hoverEnd ? anchor : hoverEnd) : null;
  const hi = anchor && hoverEnd ? (anchor <= hoverEnd ? hoverEnd : anchor) : null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-content">{MONTHS[m0]} {y}</h2>
            {selectable && (
              <p className="mt-0.5 text-xs text-faint">
                Click or drag dates to {canApplyLeave ? "apply for leave" : "add a holiday or announcement"}.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {ym !== currentYm && (
              <button onClick={() => go(currentYm)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-accent-strong hover:bg-canvas">
                Today
              </button>
            )}
            <button onClick={() => go(shiftYm(ym, -1))} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-content" aria-label="Previous month">
              <Icon name="chevronLeft" className="size-4" />
            </button>
            <button onClick={() => go(shiftYm(ym, 1))} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-content" aria-label="Next month">
              <Icon name="chevronRight" className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold uppercase tracking-wider text-faint">
          {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
        </div>

        <div className="grid select-none grid-cols-7">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="min-h-24 border-b border-r border-line bg-canvas/40" />;
            const key = `${y}-${pad(m0 + 1)}-${pad(d)}`;
            const cell = data.byDay[key];
            const isToday = key === today;
            const inRange = lo && hi ? key >= lo && key <= hi : false;
            const awayCount = cell?.away.length ?? 0;
            return (
              <div
                key={i}
                onMouseDown={(e) => {
                  if (!selectable) return;
                  e.preventDefault();
                  setAnchor(key);
                  setHoverEnd(key);
                  setSelecting(true);
                }}
                onMouseEnter={() => selecting && setHoverEnd(key)}
                className={cn(
                  "min-h-24 border-b border-r border-line p-1.5 transition-colors",
                  selectable && "cursor-pointer hover:bg-canvas/60",
                  cell?.holiday && "bg-emerald-50/60 dark:bg-emerald-500/10",
                  inRange && "bg-accent-soft",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday ? "gradient-brand-strong text-white" : "text-muted",
                  )}>
                    {d}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {cell?.holiday && (
                    <p className="truncate rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" title={cell.holiday}>
                      {cell.holiday}
                    </p>
                  )}
                  {cell?.announcements.slice(0, 2).map((t, idx) => (
                    <p key={idx} className="truncate rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" title={t}>
                      {t}
                    </p>
                  ))}
                  {cell && cell.announcements.length > 2 && (
                    <p className="px-1 text-[10px] text-faint">+{cell.announcements.length - 2} more</p>
                  )}
                  {cell?.away.slice(0, 2).map((a, idx) => (
                    <p
                      key={idx}
                      className="truncate rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                      title={`${a.name} — ${a.kind === "WFH" ? "WFH" : a.type ?? "Leave"}${a.isHalfDay ? " (half day)" : ""}`}
                    >
                      {a.kind === "WFH" ? "🏠 " : ""}{a.name}{a.isHalfDay ? " ·½" : ""}
                    </p>
                  ))}
                  {awayCount > 2 && (
                    <p className="px-1 text-[10px] text-faint" title={cell!.away.slice(2).map((a) => a.name).join("\n")}>
                      +{awayCount - 2} more away
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold text-content">On leave this month</h3>
        </div>
        <div className="p-5">
          {data.leaves.length === 0 ? (
            <p className="text-sm text-muted">No one is away this month.</p>
          ) : (
            <ul className="space-y-2">
              {data.leaves.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-1 py-0.5 text-sm">
                  <span className={cn("size-2 shrink-0 rounded-full", l.kind === "WFH" ? "bg-sky-500" : "bg-blue-500")} />
                  <span className="font-medium text-content">{l.name}</span>
                  <span className="text-muted">
                    {l.kind === "WFH" ? "Working from home" : l.type ?? "Leave"}
                    {l.isHalfDay ? " · half day" : ""}
                  </span>
                  <span className="ml-auto text-xs text-faint">
                    {l.startISO === l.endISO
                      ? formatDate(l.startISO)
                      : `${formatDate(l.startISO)} – ${formatDate(l.endISO)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-5 py-3">
            <h3 className="text-sm font-semibold text-content">Holidays this month</h3>
          </div>
          <div className="p-5">
            {data.holidays.length === 0 ? (
              <p className="text-sm text-muted">No holidays this month.</p>
            ) : (
              <ul className="space-y-2">
                {data.holidays.map((h) => (
                  <li
                    key={h.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-0.5 text-sm hover:bg-canvas"
                    onClick={() => setDetail({ kind: "holiday", title: h.name, dateISO: h.dateISO })}
                  >
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="text-faint">{h.dateISO.slice(8)}</span>
                    <span className="font-medium text-content">{h.name}</span>
                    {canManage && (
                      <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                        <HolidayActions holiday={h} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-3">
            <h3 className="text-sm font-semibold text-content">Announcements</h3>
          </div>
          <div className="p-5">
            {data.announcements.length === 0 ? (
              <p className="text-sm text-muted">No announcements this month.</p>
            ) : (
              <ul className="space-y-3">
                {data.announcements.map((a) => {
                  // Author can manage their own; legacy ownerless rows (null author)
                  // are manageable by any admin; Super Admins can manage any.
                  const canEdit =
                    canManage && (isSuperAdmin || a.authorId === currentUserId || a.authorId === null);
                  return (
                    <li
                      key={a.id}
                      className="cursor-pointer rounded-lg px-1 py-1 hover:bg-canvas"
                      onClick={() =>
                        setDetail({
                          kind: "announcement",
                          title: a.title,
                          body: a.body,
                          dateISO: a.dateISO,
                          authorName: a.authorName,
                          postedAt: a.postedAt,
                          attachments: a.attachments,
                        })
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full bg-amber-500" />
                        <p className="text-sm font-medium text-content">{a.title}</p>
                        <span className="ml-auto text-xs text-faint">{a.dateISO.slice(8)}</span>
                        {canEdit && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <AnnouncementActions announcement={a} />
                          </span>
                        )}
                      </div>
                      {a.body && <p className="mt-0.5 pl-4 text-sm text-muted">{a.body}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {selection && (
        <DateActionModal
          start={selection.start}
          end={selection.end}
          onClose={() => setSelection(null)}
          canManage={canManage}
          canApplyLeave={canApplyLeave}
          balances={balances}
        />
      )}

      {detail && <CalendarDetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
