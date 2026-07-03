/**
 * One-time backfill: assign a per-company sequential `taskNumber` to every task
 * that doesn't have one yet (in creation order), and advance `Company.taskSeq`
 * so newly-created tasks continue the sequence.
 *
 * Safe to re-run — only numbers tasks whose taskNumber is still null, continuing
 * from the current company max. Run once locally and once against prod:
 *
 *   npx prisma db push            # adds Company.taskSeq + Task.taskNumber first
 *   npx tsx prisma/backfill-task-numbers.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true, taskSeq: true } });
  for (const c of companies) {
    const maxAgg = await prisma.task.aggregate({
      where: { project: { companyId: c.id } },
      _max: { taskNumber: true },
    });
    let n = maxAgg._max.taskNumber ?? 0;

    const tasks = await prisma.task.findMany({
      where: { project: { companyId: c.id }, taskNumber: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (const t of tasks) {
      n += 1;
      await prisma.task.update({ where: { id: t.id }, data: { taskNumber: n } });
    }

    if (n > c.taskSeq) {
      await prisma.company.update({ where: { id: c.id }, data: { taskSeq: n } });
    }
    console.log(`[${c.name}] numbered ${tasks.length} task(s); counter now ${Math.max(n, c.taskSeq)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
