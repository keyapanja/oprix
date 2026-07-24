import { cn } from "@/lib/cn";

// A pill for the "Type" column of the leave/WFH lists. WFH gets a fixed,
// distinct brand-green look; every leave type gets its own stable colour so
// the column reads as consistent coloured pills (not a mix of pill + plain text).
//
// Colours are assigned by hashing the type NAME (unique per company), so the
// same leave type is always the same colour across every list. The palette is
// deliberately green-free — green is reserved for WFH.
const PALETTE = [
  "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
  "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25",
  "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25",
  "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/25",
  "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/25",
  "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-500/25",
  "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/25",
  "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/25",
];

// WFH: fixed brand-green pill (matches the previous WFH badge).
const WFH_CLASS =
  "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25";

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function LeaveTypeBadge({
  kind,
  typeName,
  leaveTypeId,
  className,
}: {
  kind: "LEAVE" | "WFH";
  typeName?: string | null;
  leaveTypeId?: string | null;
  className?: string;
}) {
  if (kind === "WFH") return <span className={cn(PILL, WFH_CLASS, className)}>WFH</span>;
  const key = typeName || leaveTypeId || "";
  const cls = PALETTE[hash(key) % PALETTE.length];
  return <span className={cn(PILL, cls, className)}>{typeName ?? "Leave"}</span>;
}
