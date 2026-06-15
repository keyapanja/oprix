import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ClientAdd } from "@/components/clients/client-add";
import { ClientEdit } from "@/components/clients/client-edit";

export const metadata: Metadata = { title: "Clients · Operix" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await requirePage("client:manage");
  const sp = await searchParams;

  const clients = await prisma.client.findMany({
    where: { companyId: session.companyId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
      address: true,
      _count: { select: { projects: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${clients.length} ${clients.length === 1 ? "client" : "clients"}.`}
      />
      <ClientAdd defaultOpen={sp.new === "1"} />

      <Card>
        {clients.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted">No clients yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Projects</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-canvas">
                  <td className="px-5 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium text-content hover:text-accent">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">{c.companyName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{c.email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{c._count.projects}</td>
                  <td className="px-5 py-3 text-right">
                    <ClientEdit client={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
