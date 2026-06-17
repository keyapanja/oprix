import "server-only";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { listPermissions } from "@/lib/auth/permissions";
import { actorLabel } from "@/lib/activity";
import { mintExtensionToken } from "@/lib/ext/auth";
import { corsJson, preflight } from "@/lib/ext/handler";
import type { ExtUser } from "@/shared/ext-contract";

export const dynamic = "force-dynamic";

// Basic in-memory per-IP rate limit (single host; resets on restart) to blunt
// online password guessing against this unauthenticated, internet-exposed route.
const ATTEMPTS = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000;
function rateLimited(key: string): boolean {
  const now = Date.now();
  const rec = ATTEMPTS.get(key);
  if (!rec || now > rec.resetAt) {
    ATTEMPTS.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

export function OPTIONS(req: Request) {
  return preflight(req);
}

// Email + password → a bearer token. The web-authorize connect flow
// (/connect-extension) is the preferred path (no password in the extension);
// this is the simpler fallback used for local development / testing.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { error: "Invalid request body" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const label = String(b.label ?? "Browser extension");
  if (!email || !password) {
    return corsJson(req, { error: "Email and password are required" }, 400);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return corsJson(req, { error: "Too many attempts — try again in a minute." }, 429);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, isActive: true },
    select: { id: true, companyId: true, role: true, email: true, passwordHash: true },
  });
  // Uniform failure to avoid leaking which emails exist.
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return corsJson(req, { error: "Invalid email or password" }, 401);
  }

  const { raw } = await mintExtensionToken({ id: user.id, companyId: user.companyId }, label);
  const [company, capabilities, displayName] = await Promise.all([
    prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } }),
    listPermissions(user.companyId, user.role),
    actorLabel(user.id),
  ]);
  const me: ExtUser = {
    id: user.id,
    email: user.email,
    displayName,
    role: user.role,
    companyId: user.companyId,
    companyName: company?.name ?? "",
    capabilities,
  };
  return corsJson(req, { token: raw, user: me });
}
