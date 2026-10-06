import { OptionChip } from "@/components/forms/option-chip";
import { answerToText, type FieldDef } from "@/lib/forms/types";

// An entry's answers, read-only, laid out the same wherever an entry is shown:
// the entry popup and the entry's own public page. No hooks, so it renders on
// either side of the server/client line.

/** Past this many characters an answer reads better across the full width. */
const WIDE_TEXT = 60;

/**
 * Two answers to a row, in form order. Long ones (lists, repeaters, anything
 * past WIDE_TEXT) take the whole row; a short one that would otherwise sit
 * alone — before a long answer, or last — stretches across it too, so the grid
 * never leaves a gap and nothing moves out of the order the form asked it in.
 */
function answerLayout(fields: FieldDef[], data: Record<string, unknown>): { field: FieldDef; wide: boolean }[] {
  const long = fields.map(
    (f) => f.type === "repeater" || f.type === "list" || answerToText(f, data[f.id]).length > WIDE_TEXT,
  );
  const out: { field: FieldDef; wide: boolean }[] = [];
  let rowStart = true;
  for (let i = 0; i < fields.length; i++) {
    if (long[i]) {
      out.push({ field: fields[i], wide: true });
      rowStart = true;
    } else if (rowStart) {
      const alone = i + 1 >= fields.length || long[i + 1];
      out.push({ field: fields[i], wide: alone });
      rowStart = alone;
    } else {
      out.push({ field: fields[i], wide: false });
      rowStart = true;
    }
  }
  return out;
}

/** Read-only display of one stored answer (repeater rows expanded). */
function ViewValue({ field, value }: { field: FieldDef; value: unknown }) {
  if (field.type === "repeater") {
    const rows = Array.isArray(value) ? value : [];
    const subs = field.subFields ?? [];
    if (rows.length === 0) return <span className="text-sm text-muted">—</span>;
    return (
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg bg-canvas/50 p-2.5 ring-1 ring-inset ring-line">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Row {i + 1}</p>
            <dl className="space-y-0.5">
              {subs.map((sf) => (
                <div key={sf.id} className="flex gap-2 text-sm">
                  <dt className="shrink-0 text-muted">{sf.label}:</dt>
                  <dd className="break-words text-content">{answerToText(sf, (row as Record<string, unknown>)?.[sf.id]) || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }
  if (field.type === "list") {
    const items = Array.isArray(value) ? (value as unknown[]).filter((x) => typeof x === "string" && x.trim() !== "") : [];
    if (items.length === 0) return <span className="text-sm text-muted">—</span>;
    return (
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-content">
        {items.map((it, i) => (
          <li key={i} className="break-words">
            {String(it)}
          </li>
        ))}
      </ul>
    );
  }

  if (field.type === "dropdown" && field.chips) {
    const s = answerToText(field, value);
    return s ? <OptionChip field={field} value={s} /> : <span className="text-sm text-muted">—</span>;
  }

  if (field.type === "check") {
    return (
      <input
        type="checkbox"
        checked={value === true || value === "true"}
        readOnly
        aria-label={answerToText(field, value)}
        className="pointer-events-none size-4 rounded border-line-strong text-brand-600"
      />
    );
  }

  const text = answerToText(field, value);
  return <span className="whitespace-pre-wrap break-words text-sm text-content">{text || "—"}</span>;
}

/** The answers as a two-column grid. Pass only the fields to show, in order. */
export function EntryAnswers({ fields, data }: { fields: FieldDef[]; data: Record<string, unknown> }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {answerLayout(fields, data).map(({ field: f, wide }) => (
        <div key={f.id} className={wide ? "sm:col-span-2" : undefined}>
          <dt className="text-xs font-medium uppercase tracking-wide text-faint">{f.label}</dt>
          <dd className="mt-0.5">
            <ViewValue field={f} value={data[f.id]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
