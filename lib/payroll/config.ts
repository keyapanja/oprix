// India statutory payroll configuration. Rates change yearly, so they live here
// (config) rather than scattered as magic numbers, and every payslip freezes a
// `ratesSnapshot` of what was applied so historical slips never drift.
// Professional Tax is per-state slab data and lives in the DB (ProfessionalTaxSlab).
// Money is integer paise everywhere.

export const PAYROLL_CONFIG = {
  version: "IN-FY2025-26",

  // Employees' Provident Fund (EPF). Employee + employer each contribute 12% of
  // "PF wages" (Basic + DA). Statutory wage ceiling is ₹15,000/month — by default
  // we cap PF wages at the ceiling (the common policy). Employer 12% is split
  // 8.33% EPS / 3.67% EPF upstream; for payroll we only need the totals.
  pf: {
    employeeRate: 0.12,
    employerRate: 0.12,
    wageCeilingPaise: 15_000_00, // ₹15,000
    capAtCeiling: true,
  },

  // Employees' State Insurance (ESI). Applies only when monthly gross ≤ ₹21,000.
  // Employee 0.75%, employer 3.25% of gross.
  esi: {
    employeeRate: 0.0075,
    employerRate: 0.0325,
    grossCeilingPaise: 21_000_00, // ₹21,000 eligibility threshold
  },

  // Loss-of-pay per-day divisor: a fixed 30-day month (Gross ÷ 30), regardless
  // of the calendar length of the month.
  lop: { divisorDays: 30 },
} as const;

// Human-readable summary for the Payroll → Settings screen.
export const STATUTORY_SUMMARY = [
  { code: "PF", label: "Provident Fund (EPF)", detail: "12% of Basic, capped at ₹15,000 wage. Employee & employer each." },
  { code: "ESI", label: "Employees' State Insurance", detail: "0.75% employee / 3.25% employer of gross, only when gross ≤ ₹21,000." },
  { code: "PT", label: "Professional Tax", detail: "Per-state slabs you configure below; applied by monthly gross." },
] as const;
