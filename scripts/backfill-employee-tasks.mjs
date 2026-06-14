// One-off: grant EMPLOYEE the `task:manage` capability in companies whose
// RolePermission rows were already seeded before this default existed.
// Un-configured companies need nothing — they fall back to DEFAULT_PERMISSIONS.
// Idempotent (skipDuplicates). Run: node --env-file=.env scripts/backfill-employee-tasks.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const companies = await prisma.company.findMany({ select: { id: true, name: true } });
let patched = 0;
let defaultOnly = 0;

for (const c of companies) {
  const rows = await prisma.rolePermission.count({ where: { companyId: c.id } });
  if (rows === 0) {
    console.log(`  • ${c.name}: not configured → default applies (no row needed)`);
    defaultOnly++;
    continue;
  }
  const res = await prisma.rolePermission.createMany({
    data: [{ companyId: c.id, role: "EMPLOYEE", action: "task:manage" }],
    skipDuplicates: true,
  });
  console.log(`  • ${c.name}: configured → added ${res.count} row(s)`);
  patched++;
}

console.log(`\nDone. configured-patched=${patched}, default-only=${defaultOnly}`);
await prisma.$disconnect();
