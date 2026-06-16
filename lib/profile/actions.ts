"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

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
