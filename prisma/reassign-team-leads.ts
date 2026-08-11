/**
 * One-time migration: move every user still on the retired TEAM_LEAD role to
 * EMPLOYEE. Their elevated access is preserved through the "Department Head"
 * access column (stored under the TEAM_LEAD slot) as long as they head a
 * department — so make sure department heads are set in Organization → Departments.
 *
 * Dry-run by default; add --commit to apply. Run against the target DB, e.g.:
 *   DATABASE_URL="postgres://…"  npx tsx prisma/reassign-team-leads.ts           (dry run)
 *   DATABASE_URL="postgres://…"  npx tsx prisma/reassign-team-leads.ts --commit  (apply)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

async function main() {
  const teamLeads = await prisma.user.findMany({
    where: { role: "TEAM_LEAD" },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  });

  if (!teamLeads.length) {
    console.log("No users have the Team Lead role — nothing to do.");
    return;
  }

  console.log(`Found ${teamLeads.length} Team Lead user(s):`);
  for (const u of teamLeads) console.log(`  - ${u.employee?.fullName ?? u.email}`);

  if (!COMMIT) {
    console.log("\nDRY RUN — re-run with --commit to reassign them to Employee.");
    console.log("Their access as a department head is preserved via the Department Head column,");
    console.log("so confirm each is set as their department's Head in Organization → Departments.");
    return;
  }

  const res = await prisma.user.updateMany({
    where: { role: "TEAM_LEAD" },
    data: { role: "EMPLOYEE" },
  });
  console.log(`\n✓ Reassigned ${res.count} user(s): Team Lead → Employee.`);
  console.log("The former Team Lead access rows are kept as the Department Head bucket.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
