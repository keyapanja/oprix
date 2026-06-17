import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Clears the session cookie, then sends the user to /login. This breaks the
// redirect loop that happens when the edge still sees a valid JWT but the
// account is gone or deactivated (getSession → null): redirecting such a user
// to /login alone would just bounce them back. Pages and guards send null
// sessions here instead of straight to /login.
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set("operix_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
