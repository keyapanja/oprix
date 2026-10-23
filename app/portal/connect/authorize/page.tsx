import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePortal } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { checkAuthorize, type AuthorizeRequest } from "@/lib/api/oauth";
import { primaryContactId } from "@/lib/api/auth";
import { Card } from "@/components/ui/card";
import { OAuthConsent } from "@/components/portal/oauth-consent";

export const metadata: Metadata = { title: "Connect an app · Client Portal" };

const FIELDS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

/**
 * The OAuth authorization endpoint: where Claude sends someone to approve a
 * connection. Signed-out visitors are sent to log in and brought back here.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePortal();
  const sp = await searchParams;
  const request: Partial<AuthorizeRequest> = {};
  for (const f of FIELDS) {
    const v = sp[f];
    if (typeof v === "string") request[f] = v;
  }

  const checked = await checkAuthorize(request);
  if ("redirect" in checked) redirect(checked.redirect);
  if ("fatal" in checked) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-sm text-muted">
        <h1 className="mb-2 text-lg font-semibold text-content">This connection link doesn&apos;t work</h1>
        {checked.fatal}
      </Card>
    );
  }

  const [client, primaryId, projects] = await Promise.all([
    prisma.client.findFirst({ where: { id: session.clientId, companyId: session.companyId }, select: { name: true, apiEnabled: true } }),
    primaryContactId(session.clientId, session.companyId),
    prisma.project.findMany({
      where: { clientId: session.clientId, companyId: session.companyId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const blocked = !client?.apiEnabled
    ? "API access isn't switched on for your account. Ask your Business Manager if you'd like to connect Claude."
    : primaryId !== session.userId
      ? "Only your account's primary contact can connect apps. Ask them to connect it, or to sign in here."
      : null;

  return (
    <OAuthConsent
      request={request}
      appName={checked.ok.app.name}
      returnHost={new URL(checked.ok.redirectUri).host}
      accountName={client?.name ?? ""}
      wantsWrite={checked.ok.wantsWrite}
      projects={projects}
      blocked={blocked}
    />
  );
}
