import { clientIp, rateLimited } from "@/lib/auth/rate-limit";
import { json, preflight, readParams } from "@/lib/api/http";
import { exchangeCode, refreshTokens } from "@/lib/api/oauth";

export const dynamic = "force-dynamic";

// Token endpoint: exchange a one-time code (with its PKCE verifier) for tokens,
// or rotate a refresh token. Public clients only — PKCE replaces a secret.
export async function POST(req: Request) {
  if (rateLimited(`oauth-token:${clientIp(req.headers)}`, 60, 60_000)) {
    return json({ error: "slow_down", error_description: "Too many requests." }, 429);
  }
  const p = await readParams(req);
  const out =
    p.grant_type === "authorization_code"
      ? await exchangeCode(p)
      : p.grant_type === "refresh_token"
        ? await refreshTokens(p)
        : { error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token." };
  return "error" in out ? json(out, 400) : json(out);
}

export const OPTIONS = preflight;
