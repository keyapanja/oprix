import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { listExtensionTokens } from "@/lib/ext/auth";
import { PageHeader } from "@/components/ui/page-header";
import { DevicesList } from "@/components/ext/devices-list";

export const metadata: Metadata = { title: "Connected devices · Operix" };

export default async function DevicesPage() {
  const session = await requirePage("self:service");
  const rows = await listExtensionTokens(session.userId);
  const devices = rows.map((d) => ({
    id: d.id,
    label: d.label,
    createdAt: d.createdAt.toISOString(),
    lastUsedAt: d.lastUsedAt ? d.lastUsedAt.toISOString() : null,
    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
  }));

  return (
    <>
      <PageHeader
        title="Connected devices"
        description="Browser extensions connected to your Operix account."
      />
      <DevicesList devices={devices} />
    </>
  );
}
