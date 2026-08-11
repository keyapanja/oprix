"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { notify } from "@/lib/notifications/notify";

export type BroadcastState = { ok?: boolean; error?: string; sent?: number };

const Schema = z.object({
  title: z.string().trim().min(1, "Add a title").max(120),
  body: z.string().trim().min(1, "Add a message").max(1000),
  audience: z.enum(["all", "departments", "employees"]),
  departmentIds: z.array(z.string()).optional(),
  employeeIds: z.array(z.string()).optional(),
});
export type BroadcastInput = z.infer<typeof Schema>;

/**
 * Admin-sent one-off notification: a title + message pushed to a chosen
 * audience — everyone, specific departments, or specific people. Fans out
 * through notify() so each recipient gets the in-app bell row + a browser (Web
 * Push) notification; no email (it's a manual ping, not a pref-gated category).
 */
export async function sendManualNotification(input: BroadcastInput): Promise<BroadcastState> {
  const session = await requireCapability("employee:manage");
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Narrow the recipient set by the chosen audience (active internal users who
  // are linked to a non-deleted employee).
  const empWhere: Prisma.EmployeeWhereInput = { companyId: session.companyId, deletedAt: null };
  if (d.audience === "departments") {
    if (!d.departmentIds?.length) return { error: "Pick at least one department." };
    empWhere.departmentId = { in: d.departmentIds };
  } else if (d.audience === "employees") {
    if (!d.employeeIds?.length) return { error: "Pick at least one person." };
    empWhere.id = { in: d.employeeIds };
  }

  const users = await prisma.user.findMany({
    where: {
      companyId: session.companyId,
      isActive: true,
      role: { not: "CLIENT" },
      id: { not: session.userId }, // don't notify yourself
      employee: { is: empWhere },
    },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { error: "No recipients matched — they may not have a login yet." };

  await notify(ids, {
    type: "GENERAL",
    title: d.title,
    body: d.body,
    email: false, // in-app bell + browser push only
  });
  return { ok: true, sent: ids.length };
}
