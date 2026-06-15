"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export type KbState = { ok?: boolean; error?: string; id?: string };

const ArticleSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Write some content").max(50000),
  projectId: z.string().optional().or(z.literal("")),
  departmentId: z.string().optional().or(z.literal("")),
  serviceId: z.string().optional().or(z.literal("")),
  keywords: z.string().trim().max(300).optional().or(z.literal("")),
});
export type ArticleInput = {
  title: string;
  body: string;
  projectId?: string;
  departmentId?: string;
  serviceId?: string;
  keywords?: string;
};

async function validateLinks(
  companyId: string,
  projectId?: string,
  departmentId?: string,
  serviceId?: string,
): Promise<string | null> {
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
    if (!p) return "Invalid project";
  }
  if (departmentId) {
    const d = await prisma.department.findFirst({ where: { id: departmentId, companyId }, select: { id: true } });
    if (!d) return "Invalid department";
  }
  if (serviceId) {
    const s = await prisma.service.findFirst({ where: { id: serviceId, companyId }, select: { id: true } });
    if (!s) return "Invalid service";
  }
  return null;
}

export async function createArticle(input: ArticleInput): Promise<KbState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const parsed = ArticleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const bad = await validateLinks(session.companyId, d.projectId, d.departmentId, d.serviceId);
  if (bad) return { error: bad };

  const article = await prisma.kbArticle.create({
    data: {
      companyId: session.companyId,
      title: d.title,
      body: d.body,
      projectId: d.projectId || null,
      departmentId: d.departmentId || null,
      serviceId: d.serviceId || null,
      keywords: d.keywords || null,
      authorId: session.userId,
      updatedById: session.userId,
      versions: { create: { title: d.title, body: d.body, editorId: session.userId } },
    },
    select: { id: true },
  });
  revalidatePath("/knowledge-base");
  return { ok: true, id: article.id };
}

/** Anyone can edit; every save records a version (who + when). */
export async function updateArticle(id: string, input: ArticleInput): Promise<KbState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const parsed = ArticleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const existing = await prisma.kbArticle.findFirst({ where: { id, companyId: session.companyId }, select: { id: true } });
  if (!existing) return { error: "Article not found" };
  const bad = await validateLinks(session.companyId, d.projectId, d.departmentId, d.serviceId);
  if (bad) return { error: bad };

  await prisma.kbArticle.update({
    where: { id },
    data: {
      title: d.title,
      body: d.body,
      projectId: d.projectId || null,
      departmentId: d.departmentId || null,
      serviceId: d.serviceId || null,
      keywords: d.keywords || null,
      updatedById: session.userId,
      versions: { create: { title: d.title, body: d.body, editorId: session.userId } },
    },
  });
  revalidatePath("/knowledge-base");
  revalidatePath(`/knowledge-base/${id}`);
  return { ok: true, id };
}

export async function deleteArticle(id: string): Promise<KbState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const article = await prisma.kbArticle.findFirst({ where: { id, companyId: session.companyId }, select: { authorId: true } });
  if (!article) return { error: "Article not found" };
  const canManage = await hasPermission(session.companyId, session.role, "kb:manage");
  if (article.authorId !== session.userId && !canManage) {
    return { error: "Only the author or an admin can delete this article." };
  }
  await prisma.kbArticleVersion.deleteMany({ where: { articleId: id } });
  await prisma.kbArticle.delete({ where: { id } });
  revalidatePath("/knowledge-base");
  return { ok: true };
}
