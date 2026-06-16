"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";

/**
 * Allowance fields for a leave type: an "Unlimited" toggle that hides the fixed
 * day-count when on. Shared by the create + edit forms. Keeps its own state so
 * it resets cleanly when the AddForm remounts its fields on success.
 */
export function LeaveAllowanceFields({
  defaultUnlimited = false,
  defaultDays = 12,
  defaultPeriod = "YEAR",
  idPrefix = "lt",
}: {
  defaultUnlimited?: boolean;
  defaultDays?: number;
  defaultPeriod?: "YEAR" | "MONTH";
  idPrefix?: string;
}) {
  const [unlimited, setUnlimited] = useState(defaultUnlimited);
  return (
    <>
      <Field label="Allowance" className="w-40">
        <label className="flex h-9 items-center gap-2 text-sm text-content">
          <input
            type="checkbox"
            name="unlimited"
            defaultChecked={defaultUnlimited}
            onChange={(e) => setUnlimited(e.target.checked)}
            className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
          />
          No fixed limit
        </label>
      </Field>
      {!unlimited && (
        <>
          <Field label="Days" htmlFor={`${idPrefix}-val`} className="w-24">
            <Input
              id={`${idPrefix}-val`}
              name="allowanceValue"
              type="number"
              min={0}
              max={365}
              step="0.5"
              defaultValue={defaultDays}
            />
          </Field>
          <Field label="Per" className="w-32">
            <Combobox
              name="allowancePeriod"
              defaultValue={defaultPeriod}
              options={[
                { value: "YEAR", label: "Year" },
                { value: "MONTH", label: "Month" },
              ]}
            />
          </Field>
        </>
      )}
    </>
  );
}
