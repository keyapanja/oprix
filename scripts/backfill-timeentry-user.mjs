// Time tracking became user-scoped. Existing TimeEntry rows only had employeeId;
// set userId from that employee's linked user so per-person totals keep working.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.timeEntry.findMany({
  where: { userId: null, employeeId: { not: null } },
  select: { id: true, employeeId: true },
});

let updated = 0;
for (const r of rows) {
  const user = await prisma.user.findFirst({ where: { employeeId: r.employeeId }, select: { id: true } });
  if (user) {
    await prisma.timeEntry.update({ where: { id: r.id }, data: { userId: user.id } });
    updated++;
  }
}
console.log(`Set userId on ${updated} of ${rows.length} TimeEntry row(s).`);
await prisma.$disconnect();
