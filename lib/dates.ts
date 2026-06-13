// Calendar-date helpers. We treat attendance/leave dates as plain calendar
// dates stored at UTC midnight (matches Prisma @db.Date semantics).

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dateAtUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function combineDateTimeUTC(iso: string, time: string): Date {
  return new Date(`${iso}T${time}:00.000Z`);
}

/** "2026-06-13" -> "Sat, 13 Jun 2026" */
export function formatISO(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "14:30" from a Date, or "" */
export function timeHHMM(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(11, 16);
}

/** "00:04" -> "12:04 AM", "23:50" -> "11:50 PM" */
export function to12h(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, m] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Current calendar date + wall-clock time in a given IANA timezone. */
export function nowInZone(timeZone: string): { dateISO: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = g("hour");
  if (hour === "24") hour = "00"; // some engines emit 24 at midnight
  return { dateISO: `${g("year")}-${g("month")}-${g("day")}`, time: `${hour}:${g("minute")}` };
}
