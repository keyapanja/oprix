import { json, preflight, readParams } from "@/lib/api/http";
import { revokeToken } from "@/lib/api/oauth";

export const dynamic = "force-dynamic";

// RFC 7009: an app signing out. Always 200, known token or not.
export async function POST(req: Request) {
  const p = await readParams(req);
  await revokeToken(p.token);
  return json({});
}

export const OPTIONS = preflight;
