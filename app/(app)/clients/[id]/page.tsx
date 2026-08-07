import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate, formatDateTime } from "@/lib/format";
import { PROJECT_STATUS_TONE } from "@/lib/status";
import { ContactForm } from "@/components/clients/contact-form";
import { ClientPortalTeam, type PortalMember } from "@/components/clients/client-portal-team";
import { BackLink } from "@/components/ui/back-link";

export const metadata: Metadata = { title: "Client · Oprix" };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage("client:manage");

  const client = await prisma.client.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    include: {
      contacts: true,
      projects: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, status: true, dueDate: true },
      },
      users: {
        where: { role: "CLIENT", isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, passwordHash: true, lastLoginAt: true },
      },
    },
  });

  if (!client) notFound();

  // Everyone from the client's side who can sign in. The earliest login is the
  // primary contact (mirrors the portal's own team view); they can invite more.
  const members: PortalMember[] = client.users.map((u, i) => ({
    id: u.id,
    email: u.email,
    accepted: !!u.passwordHash,
    isPrimary: i === 0,
    lastLogin: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : null,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <BackLink href="/clients">Back to clients</BackLink>
      </div>

      <Card className="mb-6 p-6">
        <h1 className="text-xl font-semibold text-content">{client.name}</h1>
        <p className="mt-0.5 text-sm text-muted">{client.companyName ?? "—"}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {client.email && <span>{client.email}</span>}
          {client.phone && <span>{client.phone}</span>}
          {client.address && <span>{client.address}</span>}
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <ClientPortalTeam clientId={client.id} clientEmail={client.email} members={members} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Projects" description="Projects mapped to this client." />
          <CardBody>
            {client.projects.length === 0 ? (
              <p className="text-sm text-muted">No projects yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {client.projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <Link href={`/projects/${p.id}`} className="text-sm font-medium text-content hover:text-accent">
                      {p.name}
                    </Link>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted">{formatDate(p.dueDate)}</span>
                      <Badge tone={PROJECT_STATUS_TONE[p.status]}>{humanizeEnum(p.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contacts" />
          <CardBody className="space-y-4">
            {client.contacts.length === 0 ? (
              <p className="text-sm text-muted">No contacts added.</p>
            ) : (
              <ul className="divide-y divide-line">
                {client.contacts.map((c) => (
                  <li key={c.id} className="py-2">
                    <p className="text-sm font-medium text-content">{c.name}</p>
                    <p className="text-xs text-muted">
                      {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line pt-4">
              <ContactForm clientId={client.id} />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
