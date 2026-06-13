import { PrismaClient } from "@prisma/client";

// Single PrismaClient instance across hot-reloads in dev.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ---------------------------------------------------------------------------
// TENANCY GUARDRAIL (see docs/architecture.md §2)
// Every tenant-owned query MUST be scoped by companyId. Do not query tenant
// tables with the bare `prisma` client from feature code — go through a
// service in lib/<domain> that takes the caller's companyId and applies it.
// This wrapper makes the scope explicit and hard to forget.
// ---------------------------------------------------------------------------
export function forCompany(companyId: string) {
  if (!companyId) throw new Error("forCompany() called without a companyId");
  return { prisma, companyId };
}
