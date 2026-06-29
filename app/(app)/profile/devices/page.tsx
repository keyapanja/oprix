import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { listExtensionTokens } from "@/lib/ext/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { DevicesList } from "@/components/ext/devices-list";

export const metadata: Metadata = { title: "Connected devices · Oprix" };

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
        description="Browser extensions connected to your Oprix account."
        action={
          <Link href="/extension">
            <Button variant="secondary">
              <Icon name="download" className="size-4" />
              Get the extension
            </Button>
          </Link>
        }
      />
      <DevicesList devices={devices} />
    </>
  );
}
