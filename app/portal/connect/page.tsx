import type { Metadata } from "next";
import { requirePortal } from "@/lib/auth/guard";
import { apiAccountView } from "@/lib/api/data";
import { primaryContactId } from "@/lib/api/auth";
import { appUrl } from "@/lib/email";
import { Card } from "@/components/ui/card";
import { ApiConnect } from "@/components/portal/api-connect";

export const metadata: Metadata = { title: "Connect Claude · Client Portal" };

export default async function PortalConnectPage() {
  const session = await requirePortal();
  const [view, primaryId] = await Promise.all([
    apiAccountView(session.clientId, session.companyId),
    primaryContactId(session.clientId, session.companyId),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-content">Connect Claude</h1>
        <p className="mt-1 text-sm text-muted">
          Let Claude, or another AI assistant, see your projects and requests, and, if you allow it, raise requests,
          comment and approve work for you. It sees exactly what you see here, nothing more. Saved logins are never
          available to it.
        </p>
      </div>

      {view.enabled ? (
        <ApiConnect view={view} isPrimary={primaryId === session.userId} mcpUrl={appUrl("/api/mcp")} />
      ) : (
        <Card className="p-6 text-sm text-muted">
          API access isn&apos;t switched on for your account. If you&apos;d like to connect Claude, ask your Business
          Manager.
        </Card>
      )}
    </div>
  );
}
