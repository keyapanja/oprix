// Pure payroll math — no DB, no framework. Easy to reason about and test.
// All amounts are integer paise.

import { PAYROLL_CONFIG } from "./config";

export type LineItem = { code: string; label: string; amountPaise: number };

export type SalaryInput = {
  basic: number;
  hra: number;
  specialAllowance: number;
};

export type VariableInput = {
  earnings?: LineItem[]; // ad-hoc additions this run (bonus / incentive)
  deductions?: LineItem[]; // ad-hoc deductions this run (advance recovery, …)
};

export type PtSlab = { minGrossPaise: number; maxGrossPaise: number | null; taxPaise: number };

/** Which statutory components the company is registered for. Off = skipped. Default on. */
export type StatutoryFlags = { pfEnabled?: boolean; esiEnabled?: boolean };

/** Loss-of-pay: unpaid days this period + the divisor (calendar days in the month). */
export type LopInput = { days: number; divisorDays: number };

export type RatesSnapshot = {
  configVersion: string;
  pfEnabled: boolean;
  esiEnabled: boolean;
  pf: { rate: number; wagePaise: number; employeePaise: number; employerPaise: number };
  esi: { eligible: boolean; employeeRate: number; employerRate: number; employeePaise: number; employerPaise: number };
  pt: { amountPaise: number };
  lop: { days: number; divisorDays: number; amountPaise: number };
  employerContribPaise: number;
};

export type PayslipComputation = {
  earnings: LineItem[];
  deductions: LineItem[];
  grossPaise: number;
  totalDeductionPaise: number;
  netPaise: number;
  employerContribPaise: number; // PF + ESI employer share (cost beyond gross)
  ratesSnapshot: RatesSnapshot;
};

/** Base (fixed) earning codes — everything else on a payslip is a per-run variable line. */
export const BASE_EARNING_CODES = ["BASIC", "HRA", "SPECIAL"] as const;
/** Engine-computed deduction codes — everything else is a per-run variable line. */
export const STATUTORY_DEDUCTION_CODES = ["PF", "ESI", "PT", "LOP"] as const;

/** Round paise to the nearest whole rupee (statutory amounts are whole rupees). */
function roundRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

export function computePf(basicPaise: number) {
  const { pf } = PAYROLL_CONFIG;
  const wage = pf.capAtCeiling ? Math.min(basicPaise, pf.wageCeilingPaise) : basicPaise;
  return {
    wagePaise: wage,
    employeePaise: roundRupee(wage * pf.employeeRate),
    employerPaise: roundRupee(wage * pf.employerRate),
  };
}

export function computeEsi(grossPaise: number) {
  const { esi } = PAYROLL_CONFIG;
  const eligible = grossPaise > 0 && grossPaise <= esi.grossCeilingPaise;
  return {
    eligible,
    employeePaise: eligible ? roundRupee(grossPaise * esi.employeeRate) : 0,
    employerPaise: eligible ? roundRupee(grossPaise * esi.employerRate) : 0,
  };
}

/** First slab whose [min, max] range contains the gross. Slabs are company-configured. */
export function computePt(grossPaise: number, slabs: PtSlab[]): number {
  for (const s of slabs) {
    const okMin = grossPaise >= s.minGrossPaise;
    const okMax = s.maxGrossPaise == null || grossPaise <= s.maxGrossPaise;
    if (okMin && okMax) return s.taxPaise;
  }
  return 0;
}

export function computePayslip(
  salary: SalaryInput,
  variable: VariableInput,
  ptSlabs: PtSlab[],
  flags: StatutoryFlags = {},
  lop?: LopInput,
): PayslipComputation {
  const pfEnabled = flags.pfEnabled ?? true;
  const esiEnabled = flags.esiEnabled ?? true;

  const earnings: LineItem[] = [
    { code: "BASIC", label: "Basic", amountPaise: salary.basic },
  ];
  if (salary.hra) earnings.push({ code: "HRA", label: "House Rent Allowance", amountPaise: salary.hra });
  if (salary.specialAllowance) earnings.push({ code: "SPECIAL", label: "Special Allowance", amountPaise: salary.specialAllowance });
  for (const e of variable.earnings ?? []) if (e.amountPaise) earnings.push(e);

  const grossPaise = earnings.reduce((sum, e) => sum + e.amountPaise, 0);

  // Statutory components only apply when the company is registered for them.
  const pf = pfEnabled ? computePf(salary.basic) : { wagePaise: 0, employeePaise: 0, employerPaise: 0 };
  const esi = esiEnabled ? computeEsi(grossPaise) : { eligible: false, employeePaise: 0, employerPaise: 0 };
  const pt = computePt(grossPaise, ptSlabs);

  const deductions: LineItem[] = [];
  if (pf.employeePaise) deductions.push({ code: "PF", label: "Provident Fund (EPF)", amountPaise: pf.employeePaise });
  if (esi.employeePaise) deductions.push({ code: "ESI", label: "ESI", amountPaise: esi.employeePaise });
  if (pt) deductions.push({ code: "PT", label: "Professional Tax", amountPaise: pt });

  // Loss of pay (unpaid leave days), prorated on gross by calendar days in the month.
  let lopPaise = 0;
  if (lop && lop.days > 0 && lop.divisorDays > 0) {
    lopPaise = roundRupee((grossPaise / lop.divisorDays) * lop.days);
    if (lopPaise > 0) {
      const dayLabel = lop.days === 1 ? "1 day" : `${lop.days} days`;
      deductions.push({ code: "LOP", label: `Loss of pay (${dayLabel})`, amountPaise: lopPaise });
    }
  }

  for (const d of variable.deductions ?? []) if (d.amountPaise) deductions.push(d);

  const totalDeductionPaise = deductions.reduce((sum, d) => sum + d.amountPaise, 0);
  const netPaise = grossPaise - totalDeductionPaise;
  const employerContribPaise = pf.employerPaise + esi.employerPaise;

  return {
    earnings,
    deductions,
    grossPaise,
    totalDeductionPaise,
    netPaise,
    employerContribPaise,
    ratesSnapshot: {
      configVersion: PAYROLL_CONFIG.version,
      pfEnabled,
      esiEnabled,
      pf: { rate: PAYROLL_CONFIG.pf.employeeRate, wagePaise: pf.wagePaise, employeePaise: pf.employeePaise, employerPaise: pf.employerPaise },
      esi: { eligible: esi.eligible, employeeRate: PAYROLL_CONFIG.esi.employeeRate, employerRate: PAYROLL_CONFIG.esi.employerRate, employeePaise: esi.employeePaise, employerPaise: esi.employerPaise },
      pt: { amountPaise: pt },
      lop: { days: lop?.days ?? 0, divisorDays: lop?.divisorDays ?? 0, amountPaise: lopPaise },
      employerContribPaise,
    },
  };
}

/** Recover the fixed salary components from a stored payslip's earnings lines. */
export function salaryFromEarnings(earnings: LineItem[]): SalaryInput {
  const amt = (code: string) => earnings.find((e) => e.code === code)?.amountPaise ?? 0;
  return { basic: amt("BASIC"), hra: amt("HRA"), specialAllowance: amt("SPECIAL") };
}

/** Extract the variable (non-base / non-statutory) lines from stored payslip JSON. */
export function variableFromLines(earnings: LineItem[], deductions: LineItem[]): VariableInput {
  const baseE = new Set<string>(BASE_EARNING_CODES);
  const statD = new Set<string>(STATUTORY_DEDUCTION_CODES);
  return {
    earnings: earnings.filter((e) => !baseE.has(e.code)),
    deductions: deductions.filter((d) => !statD.has(d.code)),
  };
}
