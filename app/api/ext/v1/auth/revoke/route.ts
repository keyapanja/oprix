import "server-only";
import { revokeExtensionToken } from "@/lib/ext/auth";
import { withExtAuth, preflight } from "@/lib/ext/handler";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

// Disconnect: revoke the token used to make this call.
export function POST(req: Request) {
  return withExtAuth(req, async (session, ctx) => {
    await revokeExtensionToken(ctx.tokenId, session.userId);
    return { ok: true };
  });
}
