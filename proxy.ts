import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Next 16 renamed the "middleware" convention to "proxy". Same request/response
// API — this gates every page on a valid session cookie at the edge, and keeps
// the two audiences hard-separated: clients live entirely under /portal, staff
// never see it. (Server Actions still re-check ownership; the proxy is only the
// first line — see lib/auth/guard.ts requirePortal + per-action clientId checks.)

const COOKIE_NAME = "operix_session";
const PUBLIC_PATHS = ["/login", "/set-password", "/forgot-password"];

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

type Claims = { role: string; clientId: string | null };

async function readSession(req: NextRequest): Promise<Claims | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      role: (payload.role as string) ?? "",
      clientId: (payload.clientId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

const homeFor = (role: string) => (role === "CLIENT" ? "/portal" : "/dashboard");

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The extension API authenticates with bearer tokens (no session cookie) and
  // sets its own CORS — let it through untouched, including OPTIONS preflight.
  // Without this, no-cookie API calls would be 302'd to /login.
  if (pathname.startsWith("/api/ext/") || pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const session = await readSession(req);

  // Unauthenticated → bounce to login (preserve the FULL intended destination,
  // query included — the extension connect flow needs its params back).
  if (!session && !isPublic) {
    const dest = pathname + req.nextUrl.search;
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", dest);
    return NextResponse.redirect(url);
  }

  if (session) {
    const isClient = session.role === "CLIENT";
    const isPortalPath = pathname === "/portal" || pathname.startsWith("/portal/");

    // Authenticated on a public page → send to the right home.
    if (isPublic) {
      const url = req.nextUrl.clone();
      url.pathname = homeFor(session.role);
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Hard isolation: clients are confined to /portal; staff are kept out of it.
    if (isClient && !isPortalPath) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (!isClient && isPortalPath) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Forward the path so server layouts can run path-aware checks (e.g. the
  // employee punch-in gate) without re-parsing the URL.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
