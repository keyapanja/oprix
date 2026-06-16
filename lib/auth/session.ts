import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Session = a signed JWT in an httpOnly cookie. We only need email/password
// auth, so this is lighter and more predictable than a full auth framework.
// The token carries everything services need to scope a request: companyId,
// role, and the linked employee/client id.
// ---------------------------------------------------------------------------

const COOKIE_NAME = "operix_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = {
  userId: string;
  companyId: string;
  role: Role;
  email: string;
  employeeId: string | null;
  clientId: string | null;
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const verified = await jwtVerify(token, secret(), { algorithms: ["HS256"] }).catch(() => null);
  if (!verified) return null;
  const { payload } = verified;

  const userId = payload.userId as string;
  const companyId = payload.companyId as string;

  // Re-check the account is still active and read the CURRENT role from the DB,
  // so deactivation and role changes take effect immediately rather than only
  // after the 7-day token expiry. getSession is request-cached (React cache),
  // so this is at most one lookup per request.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true, companyId: true },
  });
  if (!user || !user.isActive || user.companyId !== companyId) return null;

  return {
    userId,
    companyId,
    role: user.role,
    email: payload.email as string,
    employeeId: (payload.employeeId as string | null) ?? null,
    clientId: (payload.clientId as string | null) ?? null,
  };
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Throw-if-absent helper for server components / actions that require auth. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}
