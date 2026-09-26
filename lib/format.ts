import type { Role } from "@prisma/client";
import { APP_TIME_ZONE } from "@/lib/dates";

/** "SUPER_ADMIN" -> "Super Admin" */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function roleLabel(role: Role): string {
  return humanizeEnum(role);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(
  d: Date | string | null | undefined,
  timeZone: string = APP_TIME_ZONE,
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

/** Paise (integer) -> "₹12,345.00" */
export function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 1-12 -> "June" (empty for out-of-range). */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

/** (2026, 6) -> "June 2026" */
export function periodLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

/**
 * Byte count -> "1.5 MB". Binary units, because that's what the OS reports for
 * the uploads folder — a storage page that disagreed with `du` would be useless.
 */
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const show = (x: number) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));
  let v = n / 1024;
  let i = 0;
  // Step up on what will be *displayed*, not on the raw value, so 1048575 reads
  // "1.0 MB" rather than the rounded-up nonsense "1024 KB".
  while (i < units.length - 1 && Number(show(v)) >= 1024) {
    v /= 1024;
    i += 1;
  }
  return `${show(v)} ${units[i]}`;
}
