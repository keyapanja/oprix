/**
 * Operix — database reset for go-live.
 *
 * SAFE BY DEFAULT: with no flag it only PRINTS row counts (read-only).
 * It wipes + reseeds ONLY when run with `--confirm`.
 *
 *   npx tsx prisma/reset.ts                 # counts only (read-only)
 *   $env:COMPANY_NAME='Acme'; $env:ADMIN_EMAIL='you@acme.com';
 *   npx tsx prisma/reset.ts --confirm       # WIPE EVERYTHING, then seed a fresh admin
 *
 * The fresh Super Admin is created WITHOUT a password (invite state). The script
 * prints a /set-password URL — open it to choose your own password. Nothing
 * about your password is ever handled here.
 */
import { PrismaClient, Role } from "@prisma/client";
import { randomBytes } from "crypto";
import { existsSync } from "fs";

// Load .env into process.env so DATABASE_URL/DIRECT_URL resolve when run via tsx.
try {
  if (typeof process.loadEnvFile === "function" && existsSync(".env")) process.loadEnvFile();
} catch {}

// Prefer the direct connection for the truncate (avoids any pooler quirks).
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

// Every model delegate, in no particular order (TRUNCATE … CASCADE handles FKs).
const MODELS = [
  "company", "holiday", "announcement", "location", "probationPeriod", "rolePermission",
  "department", "service", "serviceChecklistItem", "designation", "workShift", "user",
  "extensionToken", "employee", "employeeDocument", "emergencyContact", "employeeCapacity",
  "project", "task", "projectService", "projectServiceChecklistItem", "taskAssignee",
  "taskTimer", "checklistItem", "comment", "attachment", "attendance", "attendanceBreak",
  "leaveType", "leaveBalance", "leaveRequest", "timeEntry", "salaryStructure", "payrollRun",
  "payslip", "professionalTaxSlab", "client", "clientContact", "deliverable", "kbCategory",
  "kbArticle", "kbArticleVersion", "notification", "activityLog",
] as const;

async function counts(): Promise<number> {
  let total = 0;
  const rows: string[] = [];
  for (const m of MODELS) {
    const n = await (prisma as unknown as Record<string, { count: () => Promise<number> }>)[m].count();
    total += n;
    if (n > 0) rows.push(`  ${m.padEnd(28)} ${n}`);
  }
  console.log(rows.length ? rows.join("\n") : "  (all tables already empty)");
  console.log(`  ${"TOTAL".padEnd(28)} ${total}`);
  return total;
}

async function main() {
  const confirm = process.argv.includes("--confirm");

  if (!confirm) {
    console.log("Current row counts (read-only — pass --confirm to wipe):\n");
    await counts();
    return;
  }

  const companyName = (process.env.COMPANY_NAME || "").trim();
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!companyName || !adminEmail) {
    throw new Error("Set COMPANY_NAME and ADMIN_EMAIL env vars before --confirm.");
  }

  console.log("Before:");
  await counts();

  // Wipe every table in the public schema (FK-safe via CASCADE), keeping the schema.
  console.log("\nWiping all tables …");
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);

  // Seed: one clean company + one Super Admin in invite state (no password yet).
  const company = await prisma.company.create({ data: { name: companyName } });
  const token = randomBytes(32).toString("hex");
  await prisma.user.create({
    data: {
      companyId: company.id,
      email: adminEmail,
      role: Role.SUPER_ADMIN,
      isActive: true,
      setupToken: token,
      setupTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  console.log("\nAfter:");
  await counts();

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log(`\n✅ Fresh setup ready.`);
  console.log(`   Company:  ${company.name}`);
  console.log(`   Admin:    ${adminEmail} (SUPER_ADMIN)`);
  console.log(`   Set your password here (valid 7 days):`);
  console.log(`   ${appUrl}/set-password?token=${token}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
