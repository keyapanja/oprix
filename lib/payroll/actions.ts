"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { dateAtUTC } from "@/lib/dates";
import { formatINR, periodLabel } from "@/lib/format";
import { computePayslip, salaryFromEarnings, type LineItem, type PtSlab, type StatutoryFlags } from "@/lib/payroll/calc";
import { computeLop } from "@/lib/payroll/lop";

export type ActionState = { error?: string; ok?: boolean; message?: string; runId?: string };

const PAYROLL = "/payroll";
const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;
const toPaise = (rupees: number) => Math.round(rupees * 100);

// ---- helpers --------------------------------------------------------------

async function loadPtSlabs(companyId: string): Promise<PtSlab[]> {
  const slabs = await prisma.professionalTaxSlab.findMany({
    where: { companyId },
    orderBy: { minGrossPaise: "asc" },
    select: { minGrossPaise: true, maxGrossPaise: true, taxPaise: true },
  });
  return slabs;
}

/** Which statutory deductions this company is registered for. */
async function loadStatutoryFlags(companyId: string): Promise<StatutoryFlags> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { pfEnabled: true, esiEnabled: true },
  });
  return { pfEnabled: c?.pfEnabled ?? true, esiEnabled: c?.esiEnabled ?? true };
}

/** Recompute a run's processed count + total cost (gross + employer contributions). */
async function recomputeRunTotals(runId: string): Promise<void> {
  const slips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: { grossPaise: true, ratesSnapshot: true },
  });
  let total = 0;
  for (const s of slips) {
    const snap = s.ratesSnapshot as unknown as { employerContribPaise?: number } | null;
    total += s.grossPaise + (snap?.employerContribPaise ?? 0);
  }
  await prisma.payrollRun.update({
    where: { id: runId },
    data: { processedCount: slips.length, totalCostPaise: total },
  });
}

// ---- Salary structures ----------------------------------------------------

const SalarySchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Effective date is required"),
  basic: z.coerce.number().min(0, "Basic must be ≥ 0"),
  hra: z.coerce.number().min(0).default(0),
  specialAllowance: z.coerce.number().min(0).default(0),
});

export async function saveSalaryStructure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const parsed = SalarySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  if (d.basic <= 0) return { error: "Basic pay is required" };

  const emp = await prisma.employee.findFirst({
    where: { id: d.employeeId, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!emp) return { error: "Employee not found" };

  // One active structure per employee: deactivate the rest, add the new one.
  await prisma.$transaction([
    prisma.salaryStructure.updateMany({
      where: { employeeId: d.employeeId, isActive: true },
      data: { isActive: false },
    }),
    prisma.salaryStructure.create({
      data: {
        employeeId: d.employeeId,
        effectiveFrom: dateAtUTC(d.effectiveFrom),
        basic: toPaise(d.basic),
        hra: toPaise(d.hra),
        specialAllowance: toPaise(d.specialAllowance),
        isActive: true,
      },
    }),
  ]);

  revalidatePath(`${PAYROLL}/salaries`);
  return { ok: true };
}

// ---- Payroll runs ---------------------------------------------------------

const RunSchema = z.object({
  periodYear: z.coerce.number().int().min(2000).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
});

export async function createPayrollRun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const parsed = RunSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  let runId: string;
  try {
    const run = await prisma.payrollRun.create({
      data: { companyId: session.companyId, periodYear: d.periodYear, periodMonth: d.periodMonth },
      select: { id: true },
    });
    runId = run.id;
  } catch {
    return { error: `A payroll run for ${periodLabel(d.periodYear, d.periodMonth)} already exists.` };
  }

  revalidatePath(PAYROLL);
  return { ok: true, runId };
}

/** Generate payslips for every active employee that has a salary structure but no slip yet. */
export async function processPayrollRun(runId: string): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: session.companyId },
    select: { id: true, status: true, periodYear: true, periodMonth: true },
  });
  if (!run) return { error: "Run not found" };
  if (run.status !== "DRAFT") return { error: "Only draft runs can be processed." };

  const ptSlabs = await loadPtSlabs(session.companyId);
  const flags = await loadStatutoryFlags(session.companyId);
  const employees = await prisma.employee.findMany({
    where: { companyId: session.companyId, deletedAt: null, salaryStructures: { some: { isActive: true } } },
    select: {
      id: true,
      salaryStructures: {
        where: { isActive: true },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { basic: true, hra: true, specialAllowance: true },
      },
    },
  });

  const existing = await prisma.payslip.findMany({ where: { payrollRunId: runId }, select: { employeeId: true } });
  const have = new Set(existing.map((e) => e.employeeId));

  let created = 0;
  for (const emp of employees) {
    if (have.has(emp.id)) continue;
    const s = emp.salaryStructures[0];
    if (!s) continue;
    const lop = await computeLop(session.companyId, emp.id, run.periodYear, run.periodMonth);
    const comp = computePayslip({ basic: s.basic, hra: s.hra, specialAllowance: s.specialAllowance }, {}, ptSlabs, flags, lop);
    await prisma.payslip.create({
      data: {
        payrollRunId: runId,
        employeeId: emp.id,
        earnings: asJson(comp.earnings),
        deductions: asJson(comp.deductions),
        grossPaise: comp.grossPaise,
        totalDeductionPaise: comp.totalDeductionPaise,
        netPaise: comp.netPaise,
        ratesSnapshot: asJson(comp.ratesSnapshot),
      },
    });
    created++;
  }

  await recomputeRunTotals(runId);
  revalidatePath(`${PAYROLL}/${runId}`);
  revalidatePath(PAYROLL);
  return {
    ok: true,
    message: created
      ? `Generated ${created} payslip(s).${have.size ? ` ${have.size} already existed.` : ""}`
      : employees.length === 0
        ? "No active employees have a salary structure yet."
        : "All eligible employees already have a payslip.",
  };
}

// Add / replace a payslip's per-run bonus and one-off deduction (draft runs only).
const AdjustSchema = z.object({
  payslipId: z.string().min(1),
  bonus: z.coerce.number().min(0).default(0),
  bonusLabel: z.string().trim().max(40).optional().or(z.literal("")),
  other: z.coerce.number().min(0).default(0),
  otherLabel: z.string().trim().max(40).optional().or(z.literal("")),
});

export async function adjustPayslip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const parsed = AdjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const slip = await prisma.payslip.findFirst({
    where: { id: d.payslipId, payrollRun: { companyId: session.companyId } },
    select: {
      id: true,
      employeeId: true,
      earnings: true,
      payrollRun: { select: { id: true, status: true, periodYear: true, periodMonth: true } },
    },
  });
  if (!slip) return { error: "Payslip not found" };
  if (slip.payrollRun.status !== "DRAFT") return { error: "This run is locked — unlock it to make changes." };

  const salary = salaryFromEarnings(slip.earnings as unknown as LineItem[]);
  const variableEarnings: LineItem[] = d.bonus > 0
    ? [{ code: "BONUS", label: d.bonusLabel?.trim() || "Bonus", amountPaise: toPaise(d.bonus) }]
    : [];
  const variableDeductions: LineItem[] = d.other > 0
    ? [{ code: "OTHER", label: d.otherLabel?.trim() || "Other deduction", amountPaise: toPaise(d.other) }]
    : [];

  const ptSlabs = await loadPtSlabs(session.companyId);
  const flags = await loadStatutoryFlags(session.companyId);
  const lop = await computeLop(session.companyId, slip.employeeId, slip.payrollRun.periodYear, slip.payrollRun.periodMonth);
  const comp = computePayslip(salary, { earnings: variableEarnings, deductions: variableDeductions }, ptSlabs, flags, lop);

  await prisma.payslip.update({
    where: { id: slip.id },
    data: {
      earnings: asJson(comp.earnings),
      deductions: asJson(comp.deductions),
      grossPaise: comp.grossPaise,
      totalDeductionPaise: comp.totalDeductionPaise,
      netPaise: comp.netPaise,
      ratesSnapshot: asJson(comp.ratesSnapshot),
    },
  });

  await recomputeRunTotals(slip.payrollRun.id);
  revalidatePath(`${PAYROLL}/${slip.payrollRun.id}`);
  revalidatePath(`/payslips/${slip.id}`);
  return { ok: true };
}

export async function lockPayrollRun(runId: string): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: session.companyId },
    select: { status: true, _count: { select: { payslips: true } } },
  });
  if (!run) return { error: "Run not found" };
  if (run.status !== "DRAFT") return { error: "Only draft runs can be locked." };
  if (run._count.payslips === 0) return { error: "Generate payslips before locking." };

  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "LOCKED", lockedAt: new Date() } });
  revalidatePath(`${PAYROLL}/${runId}`);
  revalidatePath(PAYROLL);
  return { ok: true };
}

export async function unlockPayrollRun(runId: string): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: session.companyId },
    select: { status: true },
  });
  if (!run) return { error: "Run not found" };
  if (run.status !== "LOCKED") return { error: "Only locked runs can be unlocked." };

  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "DRAFT", lockedAt: null } });
  revalidatePath(`${PAYROLL}/${runId}`);
  revalidatePath(PAYROLL);
  return { ok: true };
}

export async function markPayrollRunPaid(runId: string): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: session.companyId },
    select: {
      status: true,
      periodYear: true,
      periodMonth: true,
      payslips: {
        select: { id: true, netPaise: true, employee: { select: { user: { select: { id: true } } } } },
      },
    },
  });
  if (!run) return { error: "Run not found" };
  if (run.status !== "LOCKED") return { error: "Lock the run before marking it paid." };

  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "PAID" } });

  // Notify each employee their payslip is ready, deep-linking to it.
  try {
    const label = periodLabel(run.periodYear, run.periodMonth);
    const notes = run.payslips
      .filter((p) => p.employee.user?.id)
      .map((p) => ({
        userId: p.employee.user!.id,
        type: "PAYROLL_PAID",
        title: "Payslip ready",
        body: `Your payslip for ${label} is ready. Net pay ${formatINR(p.netPaise)}.`,
        meta: asJson({ payslipId: p.id }),
      }));
    if (notes.length) await prisma.notification.createMany({ data: notes });
  } catch (e) {
    console.error("[payroll] notify employees (paid) failed:", e);
  }

  revalidatePath(`${PAYROLL}/${runId}`);
  revalidatePath(PAYROLL);
  return { ok: true };
}

export async function deletePayrollRun(runId: string): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: session.companyId },
    select: { status: true },
  });
  if (!run) return { error: "Run not found" };
  if (run.status !== "DRAFT") return { error: "Only draft runs can be deleted." };

  await prisma.$transaction([
    prisma.payslip.deleteMany({ where: { payrollRunId: runId } }),
    prisma.payrollRun.delete({ where: { id: runId } }),
  ]);
  revalidatePath(PAYROLL);
  return { ok: true };
}

// ---- Company statutory settings ------------------------------------------

export async function updatePayrollStatutory(pfEnabled: boolean, esiEnabled: boolean): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  await prisma.company.update({
    where: { id: session.companyId },
    data: { pfEnabled: !!pfEnabled, esiEnabled: !!esiEnabled },
  });
  revalidatePath(`${PAYROLL}/settings`);
  return { ok: true };
}

// ---- Professional Tax slabs ----------------------------------------------

const SlabSchema = z.object({
  state: z.string().trim().min(1, "State is required").max(60),
  minGross: z.coerce.number().min(0),
  maxGross: z.string().optional().or(z.literal("")), // blank = no upper bound
  tax: z.coerce.number().min(0),
});

export async function savePtSlab(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  const parsed = SlabSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const maxGrossPaise = d.maxGross && d.maxGross.trim() !== "" ? toPaise(Number(d.maxGross)) : null;
  if (maxGrossPaise !== null && Number.isNaN(maxGrossPaise)) return { error: "Max gross must be a number" };
  if (maxGrossPaise !== null && maxGrossPaise < toPaise(d.minGross)) {
    return { error: "Max gross can't be less than min gross" };
  }

  await prisma.professionalTaxSlab.create({
    data: {
      companyId: session.companyId,
      state: d.state,
      minGrossPaise: toPaise(d.minGross),
      maxGrossPaise,
      taxPaise: toPaise(d.tax),
    },
  });
  revalidatePath(`${PAYROLL}/settings`);
  return { ok: true };
}

export async function deletePtSlab(id: string): Promise<ActionState> {
  const session = await requireCapability("payroll:manage");
  await prisma.professionalTaxSlab.deleteMany({ where: { id, companyId: session.companyId } });
  revalidatePath(`${PAYROLL}/settings`);
  return { ok: true };
}
