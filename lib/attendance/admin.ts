"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/uploads";
import { importAttendanceFile, setCodeIgnored, type ImportSummary } from "@/lib/attendance/import";

// Everything on this module is a callable endpoint, so each export re-checks the
// capability for itself rather than trusting the page that rendered the form.

export type ActionState = { ok?: boolean; error?: string };

const MapSchema = z.object({
  employeeId: z.string().min(1, "Pick a person"),
  code: z.string().trim().max(40, "That code is too long"),
});

/**
 * Claim a device code for a person. Codes are unique per company, so taking one
 * that's already on someone else moves it rather than failing — the device only
 * ever has one enrolment per finger, and a re-used code means a new joiner
 * inherited a leaver's slot.
 */
export async function mapMachineCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("attendance:manage");
  const parsed = MapSchema.safeParse({
    employeeId: formData.get("employeeId"),
    code: formData.get("code") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { employeeId, code } = parsed.data;
  const value = code || null;

  const target = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!target) return { error: "That employee no longer exists." };

  await prisma.$transaction(async (tx) => {
    if (value) {
      await tx.employee.updateMany({
        where: { companyId: session.companyId, machineCode: value, NOT: { id: employeeId } },
        data: { machineCode: null },
      });
    }
    await tx.employee.update({ where: { id: employeeId }, data: { machineCode: value } });
  });

  // Claiming a code settles the question of whose it is, so it can't still be
  // sitting on the written-off list saying it belongs to nobody.
  if (value) await setCodeIgnored(session.companyId, value, false);

  revalidatePath("/attendance/import");
  revalidatePath("/attendance");
  return { ok: true };
}

const IgnoreSchema = z.object({
  code: z.string().trim().min(1, "Missing code").max(40, "That code is too long"),
  ignored: z.boolean(),
});

/**
 * Write a device code off, or take it back. The device ships with test and
 * placeholder enrolments that have no person behind them, so without this they
 * would be reported as unclaimed after every single upload and the list would
 * never read as "done".
 *
 * Reversible on purpose: a code that looks like junk today may turn out to be a
 * colleague whose enrolment nobody recorded.
 */
export async function setMachineCodeIgnored(
  code: string,
  ignored: boolean,
): Promise<ActionState> {
  const session = await requireCapability("attendance:manage");
  const parsed = IgnoreSchema.safeParse({ code, ignored });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await setCodeIgnored(session.companyId, parsed.data.code, parsed.data.ignored);
  revalidatePath("/attendance/import");
  return { ok: true };
}

export type ReimportState = { error?: string; summary?: ImportSummary };

/**
 * Re-run a stored upload. The point of keeping the file: after mapping the codes
 * nobody claimed, the same report can be placed properly without HR going back
 * to the device to export it again.
 */
export async function reimportStoredFile(importId: string): Promise<ReimportState> {
  const session = await requireCapability("attendance:manage");

  const batch = await prisma.attendanceImport.findFirst({
    where: { id: importId, companyId: session.companyId },
    select: { fileKey: true, fileName: true },
  });
  if (!batch) return { error: "That import no longer exists." };
  if (!batch.fileKey) {
    return { error: "The original file wasn't kept for this import — upload it again." };
  }

  let buffer: Buffer;
  try {
    buffer = await readUpload(batch.fileKey);
  } catch {
    return { error: "The stored file is missing from disk — upload it again." };
  }

  try {
    const summary = await importAttendanceFile({
      companyId: session.companyId,
      userId: session.userId,
      fileName: batch.fileName,
      buffer,
      fileKey: batch.fileKey,
    });
    revalidatePath("/attendance");
    revalidatePath("/attendance/import");
    return { summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import failed." };
  }
}
