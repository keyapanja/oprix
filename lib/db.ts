import { PrismaClient } from "@prisma/client";

// Single PrismaClient instance across hot-reloads in dev.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is expensive (serialize + write every query) and floods the
    // console; set PRISMA_LOG_QUERIES=1 only when debugging.
    log:
      process.env.PRISMA_LOG_QUERIES === "1"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ---------------------------------------------------------------------------
// TENANCY GUARDRAIL (see docs/REFERENCE.md § 2.2 Multi-tenancy)
// Every tenant-owned query MUST be scoped by companyId. Do not query tenant
// tables with the bare `prisma` client from feature code — go through a
// service in lib/<domain> that takes the caller's companyId and applies it.
// This wrapper makes the scope explicit and hard to forget.
// ---------------------------------------------------------------------------
export function forCompany(companyId: string) {
  if (!companyId) throw new Error("forCompany() called without a companyId");
  return { prisma, companyId };
}
