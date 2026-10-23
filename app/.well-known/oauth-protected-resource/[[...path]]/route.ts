import { json, preflight } from "@/lib/api/http";
import { SCOPES, issuer, resourceUrl } from "@/lib/api/oauth";

export const dynamic = "force-dynamic";

// RFC 9728: tells an MCP client that /api/mcp is protected and where to sign
// in. Served at the root and at the resource's own path suffix
// (/.well-known/oauth-protected-resource/api/mcp), which newer clients ask for.
export function GET() {
  return json({
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Oprix client portal",
  });
}

export const OPTIONS = preflight;
