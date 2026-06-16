import "server-only";
import { prisma } from "@/lib/db";
import { listPermissions } from "@/lib/auth/permissions";
import { actorLabel } from "@/lib/activity";
import { withExtAuth, preflight } from "@/lib/ext/handler";
import type { ExtUser } from "@/shared/ext-contract";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

export function GET(req: Request) {
  return withExtAuth(req, async (session): Promise<ExtUser> => {
    const [company, capabilities, displayName] = await Promise.all([
      prisma.company.findUnique({ where: { id: session.companyId }, select: { name: true } }),
      listPermissions(session.companyId, session.role),
      actorLabel(session.userId),
    ]);
    return {
      id: session.userId,
      email: session.email,
      displayName,
      role: session.role,
      companyId: session.companyId,
      companyName: company?.name ?? "",
      capabilities,
    };
  });
}
