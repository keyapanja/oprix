"use client";

import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { shiftISO, todayISO } from "@/lib/dates";

// The reporting window for the attendance roster. It lives in the URL because it
// decides which rows the server reads — so a range is shareable, and the back
// button steps through the ranges you looked at.
export function RangeNav({
  from,
  to,
  covered,
}: {
  from: string;
  to: string;
  covered: { from: string; to: string } | null;
}) {
  const router = useRouter();
  const today = todayISO();
  const go = (f: string, t: string) => router.push(`/attendance?from=${f}&to=${t}`);

  const presets: { value: string; label: string; range: () => [string, string] }[] = [
    {
      value: "all",
      label: "Everything imported",
      range: () => [covered?.from ?? shiftISO(today, -29), min(covered?.to ?? today, today)],
    },
    { value: "month", label: "This month", range: () => [`${today.slice(0, 7)}-01`, today] },
    { value: "prev", label: "Last month", range: previousMonth },
    { value: "30", label: "Last 30 days", range: () => [shiftISO(today, -29), today] },
    { value: "7", label: "Last 7 days", range: () => [shiftISO(today, -6), today] },
  ];
  const active = presets.find((p) => {
    const [f, t] = p.range();
    return f === from && t === to;
  });

  return (
    <>
      <Field label="Period" className="min-w-48">
        <Combobox
          options={presets.map((p) => ({ value: p.value, label: p.label }))}
          value={active?.value ?? ""}
          onChange={(v) => {
            const p = presets.find((x) => x.value === v);
            if (p) {
              const [f, t] = p.range();
              go(f, t);
            }
          }}
          placeholder="Custom range"
          leadingIcon="calendarDays"
        />
      </Field>
      <Field label="From" className="w-40">
        <DatePicker value={from} onChange={(v) => v && go(v, max(v, to))} />
      </Field>
      <Field label="To" className="w-40">
        <DatePicker value={to} onChange={(v) => v && go(min(from, v), v)} />
      </Field>
    </>
  );
}

const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);

function previousMonth(): [string, string] {
  const today = todayISO();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const mm = String(pm).padStart(2, "0");
  return [`${py}-${mm}-01`, `${py}-${mm}-${String(last).padStart(2, "0")}`];
}
