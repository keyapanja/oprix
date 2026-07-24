import { cn } from "@/lib/cn";

// A pill for the "Type" column of the leave/WFH lists.
//
// Reserved colours (never handed out by the palette):
//   • green  → WFH
//   • red    → unpaid leave (Leave Without Pay / LWP / Unpaid), detected by name
// Every other leave type gets its own stable colour, hashed by the type NAME
// (unique per company) so the same type is always the same colour everywhere.
const PALETTE = [
  "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
  "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25",
  "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25",
  "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/25",
  "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-500/25",
  "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/25",
  "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/25",
];

// WFH: fixed brand-green pill (matches the previous WFH badge).
const WFH_CLASS =
  "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25";

// Unpaid leave: reserved red pill.
const UNPAID_CLASS =
  "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25";

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Loss-of-pay leave types get the reserved red pill. Matches the names Oprix
 *  uses for them (Leave Without Pay / LWP / Unpaid …) without touching "Paid". */
function isUnpaidType(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("unpaid") || n.includes("without pay") || n.includes("loss of pay") || /\blwp\b/.test(n);
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
  const name = typeName ?? "Leave";
  const cls = isUnpaidType(name) ? UNPAID_CLASS : PALETTE[hash(typeName || leaveTypeId || "") % PALETTE.length];
  return <span className={cn(PILL, cls, className)}>{name}</span>;
}
