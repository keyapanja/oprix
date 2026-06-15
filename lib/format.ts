import type { Role } from "@prisma/client";

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

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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
