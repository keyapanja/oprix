"use client";

import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";

/** Formula + decimals editor for a calculation field. Tokens insert {refs}. */
export function FormulaEditor({
  formula,
  decimals,
  tokens,
  onFormula,
  onDecimals,
}: {
  formula: string;
  decimals: number | null | undefined;
  tokens: { value: string; label: string }[];
  onFormula: (s: string) => void;
  onDecimals: (n: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-muted">Formula</span>
      <Input value={formula} onChange={(e) => onFormula(e.target.value)} placeholder="e.g. {qty} * {price}" />
      {tokens.length > 0 && (
        <Combobox
          value=""
          onChange={(t) => {
            if (t) onFormula((formula ? formula + " " : "") + t);
          }}
          placeholder="+ Insert a field"
          options={tokens}
        />
      )}
      <p className="text-xs text-muted">Use + − × ÷ as <code>+ - * /</code> and ( ). A Σ token totals a repeater column.</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Decimal places</span>
        <Input
          type="number"
          value={decimals ?? ""}
          onChange={(e) => onDecimals(e.target.value === "" ? null : Number(e.target.value))}
          placeholder="auto"
        />
      </label>
    </div>
  );
}
