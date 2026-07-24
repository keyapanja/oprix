import { colorAt } from "@/lib/reports/colors";

export type ChartItem = { label: string; value: number; color?: string };

/** Horizontal labelled bars — the workhorse for "X by Y" breakdowns. */
export function BarList({
  items,
  format,
  empty = "No data for this range.",
}: {
  items: ChartItem[];
  format?: (v: number) => string;
  empty?: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const f = format ?? ((v) => `${v}`);
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-content">{it.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-muted">{f(it.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, backgroundColor: it.color ?? colorAt(i) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut + legend for categorical distributions. */
export function DonutChart({
  items,
  format,
  centerTop,
  centerBottom,
  empty = "No data for this range.",
}: {
  items: ChartItem[];
  format?: (v: number) => string;
  centerTop?: string;
  centerBottom?: string;
  empty?: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const f = format ?? ((v) => `${v}`);
  const radius = 60;
  const stroke = 22;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 160 160" className="size-40 -rotate-90">
          <circle cx={80} cy={80} r={radius} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={stroke} />
          {items.map((it, i) => {
            const len = (it.value / total) * circ;
            const seg = (
              <circle
                key={i}
                cx={80}
                cy={80}
                r={radius}
                fill="none"
                stroke={it.color ?? colorAt(i)}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        {(centerTop || centerBottom) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerTop && <span className="font-display text-xl font-bold text-content">{centerTop}</span>}
            {centerBottom && <span className="text-xs text-muted">{centerBottom}</span>}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {items.map((it, i) => (
          <div key={it.label} className="flex items-center gap-2 text-sm">
            <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: it.color ?? colorAt(i) }} />
            <span className="truncate text-content">{it.label}</span>
            <span className="ml-auto shrink-0 pl-3 font-medium tabular-nums text-muted">{f(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vertical bars for a time series. Hover shows the value. */
export function BarChart({ items, format }: { items: ChartItem[]; format?: (v: number) => string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted">No data for this range.</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const f = format ?? ((v) => `${v}`);
  return (
    <div className="flex h-44 items-stretch gap-1">
      {items.map((it, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className="group relative w-full rounded-t-md transition-all"
              style={{ height: `${(it.value / max) * 100}%`, minHeight: it.value > 0 ? 3 : 0, backgroundColor: it.color ?? colorAt(0) }}
            >
              <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-content px-1.5 py-0.5 text-[10px] text-surface opacity-0 transition-opacity group-hover:opacity-100">
                {f(it.value)}
              </span>
            </div>
          </div>
          <span className="w-full truncate text-center text-[10px] text-faint">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
