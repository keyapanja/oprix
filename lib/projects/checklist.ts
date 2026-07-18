import "server-only";
import { prisma } from "@/lib/db";

/** Resolve the checklist texts for a new task of (project, sub-category):
 *  no per-project config → the sub-category's org default template;
 *  EXTEND → default items + the project's custom items;
 *  REPLACE → the project's custom items only (default ignored). */
export async function resolveTaskChecklist(projectId: string, serviceId: string): Promise<string[]> {
  const [config, custom, def] = await Promise.all([
    prisma.projectSubcategoryChecklist.findUnique({
      where: { projectId_serviceId: { projectId, serviceId } },
      select: { mode: true },
    }),
    prisma.projectSubcategoryChecklistItem.findMany({
      where: { projectId, serviceId },
      orderBy: { orderIndex: "asc" },
      select: { text: true },
    }),
    prisma.serviceChecklistItem.findMany({
      where: { serviceId },
      orderBy: { orderIndex: "asc" },
      select: { text: true },
    }),
  ]);
  const defaults = def.map((d) => d.text);
  if (!config) return defaults;
  const customTexts = custom.map((c) => c.text);
  return config.mode === "EXTEND" ? [...defaults, ...customTexts] : customTexts;
}
