import "server-only";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { listPermissions } from "@/lib/auth/permissions";
import { actorLabel } from "@/lib/activity";
import { mintExtensionToken } from "@/lib/ext/auth";
import { corsJson, preflight } from "@/lib/ext/handler";
import type { ExtUser } from "@/shared/ext-contract";

export const dynamic = "force-dynamic";

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

  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
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
