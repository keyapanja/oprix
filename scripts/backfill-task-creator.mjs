// Tasks created before the review flow have no createdById (= reviewer). Default
// it to each company's super admin so existing tasks have a reviewer. New tasks
// stamp their real creator. Idempotent (only fills nulls).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const companies = await prisma.company.findMany({ select: { id: true } });

let updated = 0;
for (const c of companies) {
  const admin = await prisma.user.findFirst({
    where: { companyId: c.id, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) continue;
  const res = await prisma.task.updateMany({
    where: { createdById: null, project: { companyId: c.id } },
    data: { createdById: admin.id },
  });
  updated += res.count;
}
console.log(`Set createdById on ${updated} existing task(s).`);
await prisma.$disconnect();
