// Form Builder — the field-type contract shared by the builder (client), the
// renderer (client), and validation (server). No "server-only": isomorphic.
//
// A form's structure lives in Form.schema as JSON ({ fields: FieldDef[] }); a
// submission's answers live in FormSubmission.data as { [fieldId]: value }.
// Repeater rows are nested: data[repeaterId] = Array<{ [subFieldId]: value }>.

import { z } from "zod";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "phone"
  | "date"
  | "daterange"
  | "dropdown"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "yesno"
  | "reference"
  | "repeater"
  | "calculation"
  | "heading"
  | "paragraph";

/** Live platform data a "reference" field pulls its options from. */
export type RefSource = "clients" | "projects" | "employees";

export type FieldOption = { id: string; label: string };

/** Conditional visibility: show the field only when another field's answer matches. */
export type CondOp = "eq" | "neq" | "gt" | "lt" | "contains" | "empty" | "notEmpty";
export type Condition = { fieldId: string; op: CondOp; value?: string };

export type FieldDef = {
  id: string; // stable key — used in submission data; never reused
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: FieldOption[]; // dropdown / multiselect / radio / checkbox
  source?: RefSource; // reference
  subFields?: FieldDef[]; // repeater (scalar input fields only — no nesting)
  formula?: string; // calculation — e.g. "{qtyId} * {priceId}" or "{repId.subId}" (column sum)
  decimals?: number | null; // calculation — round to N decimals
  visibleWhen?: Condition; // show only when this condition holds (else hidden + skipped)
  min?: number | null; // number
  max?: number | null; // number
  maxLength?: number | null; // text / textarea
  width?: "full" | "half";
};

export type FormSchema = { fields: FieldDef[] };

// ---- Value model ----------------------------------------------------------
export type ScalarValue = string | string[] | boolean | undefined;
export type RepeaterRows = Array<Record<string, ScalarValue>>;
export type FieldValue = ScalarValue | RepeaterRows;

/** Live options for reference fields, keyed by source. Resolved server-side. */
export type Lookups = Partial<Record<RefSource, { value: string; label: string }[]>>;

// ---- Catalog (drives the builder palette) ---------------------------------

export type FieldMeta = {
  type: FieldType;
  label: string;
  icon: string;
  hasOptions: boolean; // choice fields carry an options[] list
  input: boolean; // display-only blocks don't capture an answer
};

export const FIELD_CATALOG: FieldMeta[] = [
  { type: "text", label: "Short text", icon: "text", hasOptions: false, input: true },
  { type: "textarea", label: "Long text", icon: "paragraph", hasOptions: false, input: true },
  { type: "number", label: "Number", icon: "hash", hasOptions: false, input: true },
  { type: "email", label: "Email", icon: "mail", hasOptions: false, input: true },
  { type: "phone", label: "Phone", icon: "phone", hasOptions: false, input: true },
  { type: "date", label: "Date", icon: "calendarDays", hasOptions: false, input: true },
  { type: "daterange", label: "Date range", icon: "calendar", hasOptions: false, input: true },
  { type: "dropdown", label: "Dropdown", icon: "list", hasOptions: true, input: true },
  { type: "multiselect", label: "Multi-select", icon: "checklist", hasOptions: true, input: true },
  { type: "radio", label: "Single choice", icon: "radio", hasOptions: true, input: true },
  { type: "checkbox", label: "Checkboxes", icon: "squareCheck", hasOptions: true, input: true },
  { type: "yesno", label: "Yes / No", icon: "toggle", hasOptions: false, input: true },
  { type: "reference", label: "Dynamic list", icon: "userGroup", hasOptions: false, input: true },
  { type: "repeater", label: "Repeater", icon: "copy", hasOptions: false, input: true },
  { type: "calculation", label: "Calculation", icon: "equals", hasOptions: false, input: true },
  { type: "heading", label: "Section heading", icon: "heading", hasOptions: false, input: false },
  { type: "paragraph", label: "Description text", icon: "text", hasOptions: false, input: false },
];

const META_BY_TYPE = new Map(FIELD_CATALOG.map((m) => [m.type, m]));
export const fieldMeta = (t: FieldType): FieldMeta => META_BY_TYPE.get(t) ?? FIELD_CATALOG[0];
export const isInputField = (t: FieldType): boolean => fieldMeta(t).input;
export const hasOptions = (t: FieldType): boolean => fieldMeta(t).hasOptions;

/** Field types a repeater row may contain (no nesting, no display blocks). */
export const REPEATER_SUBTYPES: FieldType[] = [
  "text", "textarea", "number", "email", "phone", "date", "daterange",
  "dropdown", "multiselect", "radio", "checkbox", "yesno", "reference", "calculation",
];

// ---- Factories (builder, client-side) -------------------------------------

/** Short unique id for new fields/options. Browser + Node 19+ both have this. */
export function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return "f" + Math.abs(Date.now() % 1e9).toString(36);
  }
}

export function makeField(type: FieldType): FieldDef {
  const base: FieldDef = { id: newId(), type, label: defaultLabel(type), required: false, width: "full" };
  if (hasOptions(type)) {
    base.options = [
      { id: newId(), label: "Option 1" },
      { id: newId(), label: "Option 2" },
    ];
  }
  if (type === "reference") base.source = "clients";
  if (type === "repeater") base.subFields = [{ id: newId(), type: "text", label: "Item", required: false, width: "full" }];
  if (type === "calculation") base.formula = "";
  return base;
}

function defaultLabel(type: FieldType): string {
  if (type === "heading") return "Section heading";
  if (type === "paragraph") return "Add a short description here.";
  return fieldMeta(type).label;
}

/** Reference sources actually used by a form (incl. inside repeaters). */
export function neededSources(fields: FieldDef[]): RefSource[] {
  const s = new Set<RefSource>();
  for (const f of fields) {
    if (f.type === "reference" && f.source) s.add(f.source);
    if (f.type === "repeater") for (const sf of f.subFields ?? []) if (sf.type === "reference" && sf.source) s.add(sf.source);
  }
  return [...s];
}

// ---- Parsing & validation -------------------------------------------------

const OptionZ = z.object({ id: z.string().min(1), label: z.string().trim().max(200) });
const SourceZ = z.enum(["clients", "projects", "employees"]);
const TypeZ = z.enum([
  "text", "textarea", "number", "email", "phone", "date", "daterange",
  "dropdown", "multiselect", "radio", "checkbox", "yesno", "reference",
  "repeater", "calculation", "heading", "paragraph",
]);

const FieldDefZ: z.ZodType<FieldDef> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(40),
    type: TypeZ,
    label: z.string().trim().min(1, "Field label is required").max(200),
    placeholder: z.string().trim().max(200).optional(),
    helpText: z.string().trim().max(500).optional(),
    required: z.boolean().optional(),
    options: z.array(OptionZ).max(100).optional(),
    source: SourceZ.optional(),
    subFields: z.array(FieldDefZ).max(50).optional(),
    formula: z.string().max(500).optional(),
    decimals: z.number().int().min(0).max(6).nullable().optional(),
    visibleWhen: z
      .object({
        fieldId: z.string().max(40),
        op: z.enum(["eq", "neq", "gt", "lt", "contains", "empty", "notEmpty"]),
        value: z.string().max(200).optional(),
      })
      .optional(),
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    maxLength: z.number().int().positive().nullable().optional(),
    width: z.enum(["full", "half"]).optional(),
  }),
);

export const FormSchemaZ = z.object({ fields: z.array(FieldDefZ).max(200) });

/** Parse a stored Form.schema Json into a typed FormSchema (never throws). */
export function parseSchema(json: unknown): FormSchema {
  const r = FormSchemaZ.safeParse(json);
  return r.success ? (r.data as FormSchema) : { fields: [] };
}

/**
 * Whether a field is shown, given the current sibling answers. A field with no
 * `visibleWhen` is always visible. Evaluated at the same level (top-level fields
 * see top-level answers; repeater sub-fields see their row's answers).
 */
export function isVisible(field: FieldDef, values: Record<string, unknown>): boolean {
  const c = field.visibleWhen;
  if (!c || !c.fieldId) return true;
  const v = values[c.fieldId];
  const s = v == null ? "" : Array.isArray(v) ? v.join(",") : v === true ? "true" : String(v);
  const target = (c.value ?? "").trim();
  switch (c.op) {
    case "empty":
      return s.trim() === "";
    case "notEmpty":
      return s.trim() !== "";
    case "eq":
      return s === target || (Array.isArray(v) && v.includes(target));
    case "neq":
      return !(s === target || (Array.isArray(v) && v.includes(target)));
    case "contains":
      return Array.isArray(v) ? v.includes(target) : s.toLowerCase().includes(target.toLowerCase());
    case "gt":
      return Number(s) > Number(target);
    case "lt":
      return Number(s) < Number(target);
    default:
      return true;
  }
}

// ---- Auto-calculation -----------------------------------------------------

// Tiny recursive-descent arithmetic evaluator. NO eval/Function (CSP-safe). Only
// + - * / ( ) and numbers; {refs} in the formula are pre-substituted with values.
function parseArith(s: string): number {
  let i = 0;
  const ws = () => {
    while (i < s.length && s[i] === " ") i++;
  };
  function factor(): number {
    ws();
    if (s[i] === "(") {
      i++;
      const v = expr();
      ws();
      if (s[i] === ")") i++;
      return v;
    }
    if (s[i] === "-") {
      i++;
      return -factor();
    }
    if (s[i] === "+") {
      i++;
      return factor();
    }
    const start = i;
    while (i < s.length && /[\d.]/.test(s[i])) i++;
    return parseFloat(s.slice(start, i)) || 0;
  }
  function term(): number {
    let v = factor();
    ws();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = factor();
      v = op === "*" ? v * r : r === 0 ? 0 : v / r;
      ws();
    }
    return v;
  }
  function expr(): number {
    let v = term();
    ws();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
      ws();
    }
    return v;
  }
  return expr();
}

/** Evaluate a formula like "{qty} * {price}", with {refs} resolved to numbers. */
export function evalFormula(formula: string, resolve: (ref: string) => number): number | null {
  if (!formula || !formula.trim()) return null;
  const expr = formula.replace(/\{([^}]+)\}/g, (_m, ref) => {
    const n = resolve(String(ref).trim());
    return Number.isFinite(n) ? `(${n})` : "(0)";
  });
  if (!/^[\d.+\-*/()\s]*$/.test(expr)) return null; // anything unresolved/odd → bail
  try {
    const val = parseArith(expr);
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

/**
 * Compute a calculation field from the current answers. Refs: `{fieldId}` =
 * that field's number; `{repeaterId.subId}` = the sum of that column across the
 * repeater's rows. Recurses into calc refs with a cycle guard.
 */
export function computeCalc(
  field: FieldDef,
  fields: FieldDef[],
  values: Record<string, unknown>,
  seen: Set<string> = new Set(),
): number | null {
  if (seen.has(field.id)) return 0;
  const next = new Set(seen).add(field.id);
  const resolve = (ref: string): number => {
    if (ref.includes(".")) {
      const [repId, subId] = ref.split(".");
      const rep = fields.find((f) => f.id === repId && f.type === "repeater");
      const subs = rep?.subFields ?? [];
      const sub = subs.find((f) => f.id === subId);
      const rows = Array.isArray(values[repId]) ? (values[repId] as Record<string, unknown>[]) : [];
      return rows.reduce((sum, row) => {
        const v = sub?.type === "calculation" ? (computeCalc(sub, subs, row, next) ?? 0) : Number(row[subId]) || 0;
        return sum + v;
      }, 0);
    }
    const f = fields.find((x) => x.id === ref);
    if (f?.type === "calculation") return computeCalc(f, fields, values, next) ?? 0;
    return Number(values[ref]) || 0;
  };
  return evalFormula(field.formula ?? "", resolve);
}

/** Format a computed value for display/storage (honours `decimals`). */
export function formatCalc(field: FieldDef, n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  const d = field.decimals;
  return d != null && d >= 0 ? n.toFixed(d) : String(Math.round(n * 1e6) / 1e6);
}

export type AnswerErrors = Record<string, string>;

/**
 * Validate a submission's answers against the form's fields. Returns the cleaned
 * data (only known input fields) and any per-field error messages. Recurses one
 * level for repeater rows.
 */
export function validateAnswers(
  fields: FieldDef[],
  raw: Record<string, unknown>,
): { ok: boolean; errors: AnswerErrors; clean: Record<string, unknown> } {
  const errors: AnswerErrors = {};
  const clean: Record<string, unknown> = {};

  for (const f of fields) {
    if (!isInputField(f.type)) continue;
    if (!isVisible(f, raw)) continue; // hidden by a condition → not stored, not required
    if (f.type === "calculation") continue; // computed in the second pass, below
    const v = raw[f.id];

    if (f.type === "checkbox" || f.type === "multiselect") {
      const arr = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
      if (f.required && arr.length === 0) errors[f.id] = "Select at least one option.";
      clean[f.id] = arr;
      continue;
    }

    if (f.type === "daterange") {
      const a = Array.isArray(v) ? v : [];
      const start = typeof a[0] === "string" ? a[0] : "";
      const end = typeof a[1] === "string" ? a[1] : "";
      if (f.required && (!start || !end)) errors[f.id] = "Select a start and end date.";
      else if (start && end && start > end) errors[f.id] = "The end date can't be before the start.";
      clean[f.id] = [start, end];
      continue;
    }

    if (f.type === "reference") {
      const s = v == null ? "" : String(v).trim();
      if (f.required && !s) errors[f.id] = "This field is required.";
      clean[f.id] = s.slice(0, 300);
      continue;
    }

    if (f.type === "repeater") {
      const subs = f.subFields ?? [];
      const rowsIn = Array.isArray(v) ? v : [];
      const rowsOut: Record<string, unknown>[] = [];
      let badRow = false;
      for (const row of rowsIn) {
        if (!row || typeof row !== "object") continue;
        const r = validateAnswers(subs, row as Record<string, unknown>);
        if (!r.ok) badRow = true;
        rowsOut.push(r.clean);
      }
      if (f.required && rowsOut.length === 0) errors[f.id] = "Add at least one row.";
      else if (badRow) errors[f.id] = "Fill in every field in each row.";
      clean[f.id] = rowsOut;
      continue;
    }

    if (f.type === "yesno") {
      const b = v === true || v === "true" || v === "yes";
      if (f.required && v === undefined) errors[f.id] = "This field is required.";
      clean[f.id] = b;
      continue;
    }

    const s = v == null ? "" : String(v).trim();
    if (!s) {
      if (f.required) errors[f.id] = "This field is required.";
      clean[f.id] = "";
      continue;
    }

    if (f.type === "number") {
      const n = Number(s);
      if (Number.isNaN(n)) errors[f.id] = "Enter a valid number.";
      else if (f.min != null && n < f.min) errors[f.id] = `Must be at least ${f.min}.`;
      else if (f.max != null && n > f.max) errors[f.id] = `Must be at most ${f.max}.`;
      clean[f.id] = Number.isNaN(n) ? s : n;
      continue;
    }

    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      errors[f.id] = "Enter a valid email.";
    }
    if (f.maxLength != null && s.length > f.maxLength) {
      errors[f.id] = `Keep it under ${f.maxLength} characters.`;
    }
    if ((f.type === "dropdown" || f.type === "radio") && f.options?.length) {
      if (!f.options.some((o) => o.label === s)) errors[f.id] = "Pick one of the options.";
    }
    clean[f.id] = s.slice(0, 5000);
  }

  // Second pass: compute visible calculation fields from the cleaned values
  // (server-authoritative — the client's number is never trusted).
  for (const f of fields) {
    if (f.type !== "calculation" || !isVisible(f, raw)) continue;
    clean[f.id] = formatCalc(f, computeCalc(f, fields, clean));
  }

  return { ok: Object.keys(errors).length === 0, errors, clean };
}

/** Human-readable label for a stored answer (used by tables/exports). */
export function answerToText(field: FieldDef, value: unknown): string {
  if (value == null) return "";
  if (field.type === "yesno") return value === true || value === "true" ? "Yes" : "No";
  if (field.type === "daterange") {
    const a = Array.isArray(value) ? value : [];
    return a[0] && a[1] ? `${a[0]} → ${a[1]}` : String(a[0] || a[1] || "");
  }
  if (field.type === "repeater") {
    const rows = Array.isArray(value) ? value : [];
    const subs = field.subFields ?? [];
    return rows
      .map((row) =>
        subs
          .map((sf) => `${sf.label}: ${answerToText(sf, (row as Record<string, unknown>)?.[sf.id])}`)
          .join(", "),
      )
      .join(" | ");
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
