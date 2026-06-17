"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createEmployee, updateEmployee, type EmployeeFormState } from "@/lib/employees/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { humanizeEnum } from "@/lib/format";

type Opt = { id: string; name: string };
type ComboOpt = { value: string; label: string };

export type EmployeeInitial = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  joiningDate: string; // YYYY-MM-DD
  dateOfBirth: string | null; // YYYY-MM-DD
  employmentType: string;
  probationStatus: string;
  probationMonths: number | null;
  departmentId: string | null;
  designationId: string | null;
  managerId: string | null;
  workShiftId: string | null;
  locationId: string | null;
};

const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
const PROBATION = ["ON_PROBATION", "CONFIRMED"];

const toOpts = (xs: Opt[]): ComboOpt[] => xs.map((x) => ({ value: x.id, label: x.name }));

export function EmployeeForm({
  nextCode,
  departments,
  designations,
  managers,
  shifts,
  locations,
  probationPeriods,
  multiLocation,
  deptHeads = {},
  employee,
}: {
  nextCode: string;
  departments: Opt[];
  designations: Array<Opt & { departmentId: string }>;
  managers: Opt[];
  shifts: Opt[];
  locations: Opt[];
  probationPeriods: number[];
  multiLocation: boolean;
  /** Department id → its head's employee id; used to pre-fill the reporting manager for new hires. */
  deptHeads?: Record<string, string>;
  employee?: EmployeeInitial;
}) {
  const isEdit = !!employee;
  const action = employee ? updateEmployee.bind(null, employee.id) : createEmployee;
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(action, {});

  // Designations are department-wise, so the list cascades from the chosen department.
  const [departmentId, setDepartmentId] = useState(employee?.departmentId ?? "");
  const [designationId, setDesignationId] = useState(employee?.designationId ?? "");
  const [managerId, setManagerId] = useState(employee?.managerId ?? "");
  const deptDesignations = useMemo<ComboOpt[]>(
    () =>
      designations
        .filter((d) => d.departmentId === departmentId)
        .map((d) => ({ value: d.id, label: d.name })),
    [designations, departmentId],
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-content">Basic details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee code" htmlFor="employeeCode" hint={isEdit ? undefined : "Auto-generated"}>
            <Input
              id="employeeCode"
              value={employee?.employeeCode ?? nextCode}
              disabled
              readOnly
              className="cursor-not-allowed text-muted"
            />
          </Field>
          <Field label="Full name" htmlFor="fullName" required>
            <Input id="fullName" name="fullName" placeholder="Jane Doe" defaultValue={employee?.fullName} required />
          </Field>
          <Field label="Email" htmlFor="email" required>
            <Input id="email" name="email" type="email" placeholder="jane@company.com" defaultValue={employee?.email} required />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" placeholder="+91 …" defaultValue={employee?.phone ?? ""} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-content">Employment</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Joining date" htmlFor="joiningDate" required>
            <DatePicker id="joiningDate" name="joiningDate" placeholder="Select date" defaultValue={employee?.joiningDate} />
          </Field>
          <Field label="Date of birth" htmlFor="dateOfBirth">
            <DatePicker id="dateOfBirth" name="dateOfBirth" placeholder="Select date" defaultValue={employee?.dateOfBirth ?? ""} />
          </Field>
          <Field label="Employment type">
            <Combobox
              name="employmentType"
              defaultValue={employee?.employmentType ?? "FULL_TIME"}
              options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: humanizeEnum(t) }))}
            />
          </Field>
          <Field label="Probation status">
            <Combobox
              name="probationStatus"
              defaultValue={employee?.probationStatus ?? "ON_PROBATION"}
              options={PROBATION.map((t) => ({ value: t, label: humanizeEnum(t) }))}
            />
          </Field>
          <Field label="Probation period" hint={probationPeriods.length === 0 ? "Add options in Organization → Probation" : undefined}>
            <Combobox
              name="probationMonths"
              defaultValue={employee?.probationMonths ? String(employee.probationMonths) : ""}
              emptyLabel="— None —"
              placeholder="— None —"
              options={probationPeriods.map((m) => ({ value: String(m), label: `${m} months` }))}
            />
          </Field>
          {multiLocation && (
            <Field label="Work location">
              <Combobox name="locationId" defaultValue={employee?.locationId ?? ""} emptyLabel="— None —" placeholder="Select location" options={toOpts(locations)} />
            </Field>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-content">Organization</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department">
            <Combobox
              name="departmentId"
              value={departmentId}
              onChange={(v) => {
                setDepartmentId(v);
                setDesignationId("");
                // New hires default to their department's head as reporting manager (still editable).
                if (!isEdit && deptHeads[v]) setManagerId(deptHeads[v]);
              }}
              emptyLabel="— None —"
              placeholder="— None —"
              options={toOpts(departments)}
            />
          </Field>
          <Field label="Designation" hint={departmentId ? undefined : "Pick a department first"}>
            <Combobox
              name="designationId"
              value={designationId}
              onChange={setDesignationId}
              emptyLabel="— None —"
              placeholder={departmentId ? "— None —" : "—"}
              options={deptDesignations}
              disabled={!departmentId}
            />
          </Field>
          <Field label="Reporting manager">
            <Combobox name="managerId" value={managerId} onChange={setManagerId} emptyLabel="— None —" placeholder="— None —" options={toOpts(managers)} />
          </Field>
          <Field label="Work shift">
            <Combobox name="workShiftId" defaultValue={employee?.workShiftId ?? ""} emptyLabel="— None —" placeholder="— None —" options={toOpts(shifts)} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={employee ? `/employees/${employee.id}` : "/employees"}>
          <Button type="button" variant="secondary">Cancel</Button>
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create employee"}
        </Button>
      </div>
    </form>
  );
}
