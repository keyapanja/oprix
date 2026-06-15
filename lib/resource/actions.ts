"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";

export type ActionState = { error?: string; ok?: boolean };

const CapacitySchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  dailyHours: z.coerce.number().min(0, "≥ 0").max(24, "≤ 24"),
  weeklyHours: z.coerce.number().min(0).max(168),
  monthlyHours: z.coerce.number().min(0).max(744),
});

export async function updateCapacity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireCapability("employee:manage");
  const parsed = CapacitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const emp = await prisma.employee.findFirst({
    where: { id: d.employeeId, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!emp) return { error: "Employee not found" };

  await prisma.employeeCapacity.upsert({
    where: { employeeId: d.employeeId },
    create: { employeeId: d.employeeId, dailyHours: d.dailyHours, weeklyHours: d.weeklyHours, monthlyHours: d.monthlyHours },
    update: { dailyHours: d.dailyHours, weeklyHours: d.weeklyHours, monthlyHours: d.monthlyHours },
  });
  revalidatePath("/resource");
  return { ok: true };
}
