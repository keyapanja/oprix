import "server-only";
import { prisma } from "@/lib/db";

/** Next sequential employee code, e.g. EMP001. Uses the max existing suffix. */
export async function nextEmployeeCode(companyId: string, prefix: string): Promise<string> {
  const existing = await prisma.employee.findMany({
    where: { companyId },
    select: { employeeCode: true },
  });
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const e of existing) {
    const m = e.employeeCode.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
