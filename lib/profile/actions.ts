"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { dateAtUTC } from "@/lib/dates";

export type ProfileState = { ok?: boolean; error?: string };

const ProfileSchema = z.object({
  nickname: z.string().trim().max(60).optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});

// avatarUrl is managed by the upload route (POST/DELETE /api/profile/avatar), not here.
export type ProfileInput = { nickname?: string; bio?: string };

/** Any signed-in user can edit their own profile. */
export async function updateMyProfile(input: ProfileInput): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      nickname: d.nickname || null,
      bio: d.bio || null,
    },
  });
  revalidatePath("/profile");
  revalidatePath("/", "layout"); // name/avatar appear in the topbar
  return { ok: true };
}

// ---- Personal details (self-service, employee-scoped) ----------------------

const EmergencyContactZ = z.object({
  name: z.string().trim().min(1).max(80),
  relationship: z.string().trim().max(40).optional().or(z.literal("")),
  phone: z.string().trim().min(1).max(30),
});

const DetailsSchema = z.object({
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  personalEmail: z.string().trim().email("Enter a valid personal email").optional().or(z.literal("")),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional().or(z.literal("")),
  emergencyContacts: z.array(EmergencyContactZ).max(10).optional(),
});
export type DetailsInput = z.infer<typeof DetailsSchema>;

/**
 * An employee edits their own personal details — phone, personal (secondary)
 * email, date of birth, and emergency contacts — so HR doesn't have to fill
 * everything in. Scoped to the caller's own employee record.
 */
export async function updateMyDetails(input: DetailsInput): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (!session.employeeId) return { error: "No employee profile to edit." };
  const empId = session.employeeId;

  const parsed = DetailsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Drop blank contact rows (a half-filled row shouldn't be saved).
  const contacts = (d.emergencyContacts ?? []).filter((c) => c.name.trim() && c.phone.trim());

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: empId },
      data: {
        phone: d.phone || null,
        personalEmail: d.personalEmail || null,
        dateOfBirth: d.dateOfBirth ? dateAtUTC(d.dateOfBirth) : null,
      },
    }),
    prisma.emergencyContact.deleteMany({ where: { employeeId: empId } }),
    ...(contacts.length
      ? [
          prisma.emergencyContact.createMany({
            data: contacts.map((c) => ({
              employeeId: empId,
              name: c.name,
              relationship: c.relationship || null,
              phone: c.phone,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/profile");
  return { ok: true };
}
