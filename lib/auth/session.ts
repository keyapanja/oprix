import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

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

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as string,
      companyId: payload.companyId as string,
      role: payload.role as Role,
      email: payload.email as string,
      employeeId: (payload.employeeId as string | null) ?? null,
      clientId: (payload.clientId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

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
