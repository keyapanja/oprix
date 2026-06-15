import "server-only";
import { prisma } from "@/lib/db";
import type { LineItem, RatesSnapshot } from "@/lib/payroll/calc";

// All reads here are scoped by companyId (tenancy guardrail).

export async function listPayrollRuns(companyId: string) {
  return prisma.payrollRun.findMany({
    where: { companyId },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      status: true,
      totalCostPaise: true,
      processedCount: true,
      lockedAt: true,
      _count: { select: { payslips: true } },
    },
  });
}

export async function getPayrollRun(companyId: string, runId: string) {
  return prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      status: true,
      totalCostPaise: true,
      processedCount: true,
      lockedAt: true,
      payslips: {
        orderBy: { employee: { fullName: "asc" } },
        select: {
          id: true,
          grossPaise: true,
          totalDeductionPaise: true,
          netPaise: true,
          employee: { select: { id: true, fullName: true, employeeCode: true } },
        },
      },
    },
  });
}

/** Active employees with their current (isActive) salary structure, for the salaries screen. */
export async function listEmployeeSalaries(companyId: string) {
  const employees = await prisma.employee.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      designation: { select: { name: true } },
      salaryStructures: {
        where: { isActive: true },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { id: true, basic: true, hra: true, specialAllowance: true, effectiveFrom: true },
      },
    },
  });
  return employees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    employeeCode: e.employeeCode,
    designation: e.designation?.name ?? null,
    salary: e.salaryStructures[0] ?? null,
  }));
}

export async function getPtSlabs(companyId: string) {
  return prisma.professionalTaxSlab.findMany({
    where: { companyId },
    orderBy: { minGrossPaise: "asc" },
    select: { id: true, state: true, minGrossPaise: true, maxGrossPaise: true, taxPaise: true },
  });
}

/** Company-level statutory deduction toggles (default on if unset). */
export async function getCompanyPayrollFlags(companyId: string) {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { pfEnabled: true, esiEnabled: true },
  });
  return { pfEnabled: c?.pfEnabled ?? true, esiEnabled: c?.esiEnabled ?? true };
}

export async function listEmployeePayslips(companyId: string, employeeId: string) {
  return prisma.payslip.findMany({
    where: { employeeId, payrollRun: { companyId, status: { in: ["LOCKED", "PAID"] } } },
    orderBy: [{ payrollRun: { periodYear: "desc" } }, { payrollRun: { periodMonth: "desc" } }],
    select: {
      id: true,
      grossPaise: true,
      netPaise: true,
      totalDeductionPaise: true,
      payrollRun: { select: { periodYear: true, periodMonth: true, status: true } },
    },
  });
}

export type PayslipDetail = {
  id: string;
  earnings: LineItem[];
  deductions: LineItem[];
  grossPaise: number;
  totalDeductionPaise: number;
  netPaise: number;
  ratesSnapshot: RatesSnapshot;
  runStatus: "DRAFT" | "LOCKED" | "PAID";
  periodYear: number;
  periodMonth: number;
  employee: { id: string; fullName: string; employeeCode: string; designation: string | null; department: string | null };
  company: { name: string; address: string | null; logoUrl: string | null };
};

/** Full payslip for the printable view. Returns null if it isn't in the company. */
export async function getPayslipDetail(companyId: string, payslipId: string): Promise<PayslipDetail | null> {
  const p = await prisma.payslip.findFirst({
    where: { id: payslipId, payrollRun: { companyId } },
    select: {
      id: true,
      earnings: true,
      deductions: true,
      grossPaise: true,
      totalDeductionPaise: true,
      netPaise: true,
      ratesSnapshot: true,
      payrollRun: { select: { status: true, periodYear: true, periodMonth: true, company: { select: { name: true, address: true, logoUrl: true } } } },
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeCode: true,
          designation: { select: { name: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    earnings: p.earnings as unknown as LineItem[],
    deductions: p.deductions as unknown as LineItem[],
    grossPaise: p.grossPaise,
    totalDeductionPaise: p.totalDeductionPaise,
    netPaise: p.netPaise,
    ratesSnapshot: p.ratesSnapshot as unknown as RatesSnapshot,
    runStatus: p.payrollRun.status,
    periodYear: p.payrollRun.periodYear,
    periodMonth: p.payrollRun.periodMonth,
    employee: {
      id: p.employee.id,
      fullName: p.employee.fullName,
      employeeCode: p.employee.employeeCode,
      designation: p.employee.designation?.name ?? null,
      department: p.employee.department?.name ?? null,
    },
    company: p.payrollRun.company,
  };
}
