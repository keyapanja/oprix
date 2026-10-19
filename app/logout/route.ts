import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/vault/crypto";

export const dynamic = "force-dynamic";

// Clears the session cookie, then sends the user to /login. This breaks the
// redirect loop that happens when the edge still sees a valid JWT but the
// account is gone or deactivated (getSession → null): redirecting such a user
// to /login alone would just bounce them back. Pages and guards send null
// sessions here instead of straight to /login.
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set("oprix_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  // Signing out locks the credentials library on this browser too.
  for (const name of ["oprix_vault", "oprix_vault_edit"]) {
    const token = req.cookies.get(name)?.value;
    if (token) {
      await prisma.vaultUnlock
        .updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } })
        .catch(() => {});
    }
    res.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
