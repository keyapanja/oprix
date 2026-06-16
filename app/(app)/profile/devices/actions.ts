"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { revokeExtensionToken } from "@/lib/ext/auth";

export async function revokeMyDevice(id: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  await revokeExtensionToken(id, session.userId);
  revalidatePath("/profile/devices");
  return { ok: true };
}
