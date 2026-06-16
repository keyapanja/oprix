import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { authenticateExtension } from "@/lib/ext/auth";
import { corsJson, preflight } from "@/lib/ext/cors";

export { preflight, corsJson };

/**
 * Wrap a bearer-authenticated extension route: validates the token, runs `fn`
 * with the resolved session, and serializes the result as CORS JSON. A thrown
 * error becomes a 400 `{ error }`; missing/invalid auth is 401.
 */
export async function withExtAuth(
  req: Request,
  fn: (session: SessionUser, ctx: { tokenId: string }) => Promise<unknown>,
): Promise<Response> {
  try {
    const auth = await authenticateExtension(req);
    if (!auth) return corsJson(req, { error: "Unauthorized" }, 401);
    const body = await fn(auth.session, { tokenId: auth.tokenId });
    return corsJson(req, body ?? { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return corsJson(req, { error: message }, 400);
  }
}
