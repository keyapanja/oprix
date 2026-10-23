import { json, preflight } from "@/lib/api/http";
import { SCOPES, issuer } from "@/lib/api/oauth";
import { appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

// RFC 8414: how to sign in. The consent screen lives in the client portal, so
// the person approving is always a signed-in client login.
export function GET() {
  return json({
    issuer: issuer(),
    authorization_endpoint: appUrl("/portal/connect/authorize"),
    token_endpoint: appUrl("/api/oauth/token"),
    registration_endpoint: appUrl("/api/oauth/register"),
    revocation_endpoint: appUrl("/api/oauth/revoke"),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
  });
}

export const OPTIONS = preflight;
