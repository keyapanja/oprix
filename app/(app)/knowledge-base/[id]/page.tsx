import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { renderMarkdown } from "@/lib/kb/markdown";
import { DeleteArticleButton } from "@/components/kb/delete-article-button";

export const metadata: Metadata = { title: "Article · Operix" };

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePage();

  const article = await prisma.kbArticle.findFirst({
    where: { id, companyId: session.companyId },
    select: {
      id: true,
      title: true,
      body: true,
      authorId: true,
      updatedById: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { name: true } },
      department: { select: { name: true } },
      service: { select: { name: true } },
      versions: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, editorId: true, createdAt: true } },
    },
  });
  if (!article) notFound();

  const ids = [...new Set([article.authorId, article.updatedById, ...article.versions.map((v) => v.editorId)].filter(Boolean))] as string[];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, employee: { select: { fullName: true } } } });
  const nameOf = (uid?: string | null) => {
    const u = users.find((x) => x.id === uid);
    return u?.employee?.fullName ?? u?.email ?? "Someone";
  };
  const canDelete = article.authorId === session.userId || (await hasPermission(session.companyId, session.role, "kb:manage"));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3">
        <BackLink href="/knowledge-base">Knowledge Base</BackLink>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-content">{article.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {article.project?.name && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 font-medium text-brand-600 dark:text-brand-300">
                      <Icon name="briefcase" className="size-3" />
                      {article.project.name}
                    </span>
                  )}
                  {article.department?.name && (
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-muted">{article.department.name}</span>
                  )}
                  {article.service?.name && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-strong">{article.service.name}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/knowledge-base/${id}/edit`}>
                  <Button variant="secondary" size="sm">
                    <Icon name="pencil" className="size-4" />
                    Edit
                  </Button>
                </Link>
                {canDelete && <DeleteArticleButton id={id} />}
              </div>
            </div>
            <div
              className="mt-5 border-t border-line pt-5 text-[15px] text-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-content">Details</h3>
            <dl className="space-y-2 text-sm">
              {article.project?.name && (
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">Project</dt>
                  <dd className="text-right font-medium text-content">{article.project.name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Created by</dt>
                <dd className="text-right font-medium text-content">{nameOf(article.authorId)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Last edited by</dt>
                <dd className="text-right font-medium text-content">{nameOf(article.updatedById ?? article.authorId)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Updated</dt>
                <dd className="text-right font-medium text-content">{formatDateTime(article.updatedAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <div className="border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-content">Change log</h3>
            </div>
            <div className="max-h-96 overflow-y-auto p-5">
              <ul className="space-y-3">
                {article.versions.map((v) => (
                  <li key={v.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    <div>
                      <p className="text-content">
                        <span className="font-medium">{nameOf(v.editorId)}</span> edited
                      </p>
                      <p className="text-xs text-faint">{formatDateTime(v.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
