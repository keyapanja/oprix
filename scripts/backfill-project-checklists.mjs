// Seed per-project-service checklists for project-services that predate the
// feature: copy each service's default template into any project-service that
// has no checklist items yet. Idempotent (only fills empty ones).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const links = await prisma.projectService.findMany({
  select: { id: true, serviceId: true, _count: { select: { checklist: true } } },
});

let seeded = 0;
for (const ps of links) {
  if (ps._count.checklist > 0) continue;
  const template = await prisma.serviceChecklistItem.findMany({
    where: { serviceId: ps.serviceId },
    orderBy: { orderIndex: "asc" },
    select: { text: true },
  });
  if (template.length) {
    await prisma.projectServiceChecklistItem.createMany({
      data: template.map((c, i) => ({ projectServiceId: ps.id, text: c.text, orderIndex: i })),
    });
    seeded++;
  }
}
console.log(`Backfilled ${seeded} project-service checklist(s) of ${links.length} link(s).`);
await prisma.$disconnect();
