import "server-only";
import { NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { handleMessage } from "@/lib/api/mcp";
import { appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

const MAX_BODY = 1024 * 1024;

/** Where an MCP client learns how to sign in (RFC 9728), sent with every 401. */
function challenge(status: number, error: string, description: string) {
  const meta = appUrl("/.well-known/oauth-protected-resource/api/mcp");
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${meta}", error="${error}", error_description="${description.replace(/"/g, "'")}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * The client API — an MCP server for Claude and other agents. Every request
 * carries an API key or an OAuth access token; see lib/api for what a
 * connection can and can't reach.
 */
export async function POST(req: Request) {
  // Browsers never call this; one that sends a foreign Origin is refused, so a
  // web page can't use a key someone pasted into it against us.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(appUrl("/")).origin) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const auth = await authenticateApi(req);
  if (!("call" in auth)) return challenge(auth.status, auth.error, auth.description);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const messages = Array.isArray(body) ? body.slice(0, 20) : [body];
  const replies = [];
  for (const m of messages) {
    const reply = await handleMessage(m as Parameters<typeof handleMessage>[0], auth.call);
    if (reply) replies.push(reply);
  }
  if (!replies.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: { "Cache-Control": "no-store" } });
}

// Stateless server: no event stream to open and no session to end.
export function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405, headers: { Allow: "POST" } });
}
export function DELETE() {
  return NextResponse.json({ error: "Use POST" }, { status: 405, headers: { Allow: "POST" } });
}
