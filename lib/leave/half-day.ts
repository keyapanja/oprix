// Isomorphic helper for half-day periods (which half of the day a half-day
// leave falls on). Used by the apply/edit forms and the display everywhere.

export type HalfDayPeriod = "FIRST" | "SECOND";

export const HALF_DAY_OPTIONS: { value: HalfDayPeriod; label: string }[] = [
  { value: "FIRST", label: "First half" },
  { value: "SECOND", label: "Second half" },
];

/** Normalize any input to a valid period, defaulting to "FIRST". */
export function parseHalfDayPeriod(v: unknown): HalfDayPeriod {
  return v === "SECOND" ? "SECOND" : "FIRST";
}

/** Human label for a stored period, or null when there isn't one. */
export function halfDayLabel(p: string | null | undefined): string | null {
  if (p === "FIRST") return "First half";
  if (p === "SECOND") return "Second half";
  return null;
}
