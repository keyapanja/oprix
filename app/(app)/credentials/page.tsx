import type { Metadata } from "next";
import Link from "next/link";
import { requirePage, sessionCan } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { vaultProjectsFor } from "@/lib/vault/access";
import { vaultConfigured } from "@/lib/vault/crypto";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { VaultSettings } from "@/components/vault/vault-settings";

export const metadata: Metadata = { title: "Credentials · Oprix" };

/**
 * The team's way into the credentials libraries. Most staff can't open project
 * pages, so this lists only the projects whose library they can use: ones they
 * own a category on, ones a manager added them to, or every project for a
 * Super Admin.
 */
export default async function CredentialsPage() {
  const session = await requirePage();
  const [projects, isAdmin] = await Promise.all([vaultProjectsFor(session), sessionCan(session, "org:manage")]);
  const company = isAdmin
    ? await prisma.company.findUnique({
        where: { id: session.companyId },
        select: { vaultViewMinutes: true, vaultEditMinutes: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Credentials"
        description="Logins saved for each project, shared with the client. Each library opens with a code sent to your email."
      />

      {!vaultConfigured() && (
        <Card className="mb-5 flex items-start gap-3 p-4 text-sm text-muted">
          <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-faint" />
          <p>
            The credentials library isn&apos;t set up yet: the server needs its encryption key
            (<code className="text-content">CREDENTIALS_KEY</code>). Until then nothing can be saved or opened.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        {projects.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            You don&apos;t have access to any project&apos;s credentials yet. You get it by owning a category on a
            project, or when a project manager adds you.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/credentials/${p.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-content">{p.name}</p>
                    <p className="truncate text-xs text-faint">{p.client?.name ?? "No client"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="key" className="size-3.5" />
                      {p._count.credentials}
                    </span>
                    <Icon name="chevronRight" className="size-4 text-faint" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {company && (
        <VaultSettings viewMinutes={company.vaultViewMinutes} editMinutes={company.vaultEditMinutes} />
      )}
    </div>
  );
}
