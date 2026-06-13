import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Demo tenant
  const company = await prisma.company.upsert({
    where: { id: "demo-company" },
    update: {},
    create: {
      id: "demo-company",
      name: "Operix Demo Pvt Ltd",
      timezone: "Asia/Kolkata",
      currency: "INR",
      businessType: "Software Services",
    },
  });

  // Super Admin login
  const email = "admin@operix.test";
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);

  await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email } },
    update: {},
    create: {
      companyId: company.id,
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
    },
  });

  console.log("Seeded:");
  console.log(`  Company: ${company.name} (${company.id})`);
  console.log(`  Super Admin: ${email}  /  ChangeMe123!`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
