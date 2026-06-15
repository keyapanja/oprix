import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { KbList, type KbItem } from "@/components/kb/kb-list";

export const metadata: Metadata = { title: "Knowledge Base · Operix" };

export default async function KnowledgeBasePage() {
  const session = await requirePage(); // accessible to everyone

  const articles = await prisma.kbArticle.findMany({
    where: { companyId: session.companyId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      keywords: true,
      updatedAt: true,
      updatedById: true,
      authorId: true,
      project: { select: { name: true } },
      department: { select: { name: true } },
      service: { select: { name: true } },
    },
  });

  const ids = [...new Set(articles.flatMap((a) => [a.updatedById, a.authorId]).filter(Boolean))] as string[];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, employee: { select: { fullName: true } } } })
    : [];
  const nameOf = (uid?: string | null) => {
    const u = users.find((x) => x.id === uid);
    return u?.employee?.fullName ?? u?.email ?? "Someone";
  };

  const items: KbItem[] = articles.map((a) => ({
    id: a.id,
    title: a.title,
    keywords: a.keywords,
    projectName: a.project?.name ?? null,
    deptName: a.department?.name ?? null,
    serviceName: a.service?.name ?? null,
    updatedBy: nameOf(a.updatedById ?? a.authorId),
    updatedAt: formatDateTime(a.updatedAt),
  }));

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="Guides and workflows by department and service — everyone can read and edit."
        action={
          <Link href="/knowledge-base/new">
            <Button>
              <Icon name="plus" className="size-4" />
              New article
            </Button>
          </Link>
        }
      />
      <KbList items={items} />
    </>
  );
}
