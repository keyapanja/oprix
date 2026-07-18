import { cn } from "@/lib/cn";
import { chipClass, type FieldDef } from "@/lib/forms/types";

/** A dropdown answer rendered as its configured colour chip (table, detail view). */
export function OptionChip({ field, value }: { field: FieldDef; value: string }) {
  if (!value) return <span className="text-faint">—</span>;
  const color = field.options?.find((o) => o.label === value)?.color;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        chipClass(color),
      )}
    >
      {value}
    </span>
  );
}
