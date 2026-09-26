import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";

// Shared pieces of the passwordless sign-in flow. Deliberately NOT in
// lib/auth/actions.ts: everything exported from a "use server" file becomes a
// callable endpoint, and token lookup has no business being one.

/** Short on purpose: this token is a live session, not a password reset. */
export const MAGIC_LINK_TTL_MINUTES = 15;

/** The emailed token is stored hashed; this is how we look it back up. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** One message for every way a link can fail — no hints about which. */
export const LINK_DEAD =
  "This sign-in link is invalid, already used, or has expired. Request a new one.";

/**
 * Is this token still good? Checked before the landing page renders, *without*
 * spending it — so the link previewers and security scanners that GET every URL
 * in an inbox can't burn it before the person clicks.
 */
export async function peekMagicLink(token: string): Promise<{ email: string } | null> {
  if (!token) return null;
  const user = await prisma.user.findFirst({
    where: { loginTokenHash: hashToken(token), isActive: true },
    select: { email: true, loginTokenExpiresAt: true },
  });
  if (!user?.loginTokenExpiresAt || user.loginTokenExpiresAt < new Date()) return null;
  return { email: user.email };
}
