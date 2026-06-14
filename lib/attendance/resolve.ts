import type { AttendanceType } from "@prisma/client";

/**
 * Effective attendance status, combining the stored record, an approved leave,
 * and whether the day is a holiday. Priority:
 *   1. Admin manual mark (overrides everything)
 *   2. Approved leave -> On leave (even if they punched in)
 *   3. A punch/record -> its type (e.g. Present)
 *   4. Holiday
 *   5. Unmarked
 */
export function effectiveStatus(args: {
  recordType: AttendanceType | null;
  markedManually: boolean;
  onLeave: boolean;
  holiday: boolean;
}): AttendanceType | null {
  const { recordType, markedManually, onLeave, holiday } = args;
  if (markedManually && recordType) return recordType;
  if (onLeave) return "LEAVE";
  if (recordType) return recordType;
  if (holiday) return "HOLIDAY";
  return null;
}
