"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { AddForm } from "@/components/org/add-form";
import { DeleteButton } from "@/components/org/delete-button";
import { ServiceList } from "@/components/org/service-list";
import { PermissionsMatrix } from "@/components/org/permissions-matrix";
import {
  createDepartment,
  createService,
  createDesignation,
  createShift,
  createLocation,
  createProbationPeriod,
  setMultiLocation,
} from "@/lib/org/actions";
import { cn } from "@/lib/cn";

type Dept = { id: string; name: string };
type Svc = {
  id: string;
  name: string;
  department: { name: string } | null;
  checklist: { id: string; text: string }[];
};
type Desig = { id: string; name: string; department: { name: string } };
type Shift = { id: string; name: string; startTime: string; endTime: string; graceMinutes: number };
type Loc = { id: string; name: string };
type Prob = { id: string; months: number };

const BASE_TABS = ["Departments", "Services", "Designations", "Shifts", "Locations", "Probation"];

export function OrgTabs({
  departments,
  services,
  designations,
  shifts,
  locations,
  probationPeriods,
  multiLocation,
  accessMatrix,
}: {
  departments: Dept[];
  services: Svc[];
  designations: Desig[];
  shifts: Shift[];
  locations: Loc[];
  probationPeriods: Prob[];
  multiLocation: boolean;
  accessMatrix: Record<string, string[]> | null;
}) {
  const [tab, setTab] = useState<string>("Departments");
  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const tabs = accessMatrix ? [...BASE_TABS, "Access"] : BASE_TABS;

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-brand-500 text-accent-strong"
                : "border-transparent text-muted hover:text-content",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Departments" && (
        <Section
          title="Departments"
          empty="No departments yet."
          headers={["Name", ""]}
          form={
            <AddForm action={createDepartment}>
              <Field label="Department name" htmlFor="dept-name" className="min-w-64">
                <Input id="dept-name" name="name" placeholder="e.g. Engineering" required />
              </Field>
            </AddForm>
          }
          rows={departments.map((d) => ({
            id: d.id,
            cells: [d.name],
            delete: <DeleteButton entity="department" id={d.id} label={d.name} />,
          }))}
        />
      )}

      {tab === "Services" && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-content">Add service</h3>
            <AddForm action={createService}>
              <Field label="Service name" htmlFor="service-name" className="min-w-56">
                <Input id="service-name" name="name" placeholder="e.g. Web Development" required />
              </Field>
              <Field label="Department" className="min-w-52">
                <Combobox name="departmentId" options={deptOptions} placeholder="— None —" emptyLabel="— None —" />
              </Field>
            </AddForm>
          </Card>
          <ServiceList
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              departmentName: s.department?.name ?? null,
              checklist: s.checklist,
            }))}
          />
        </div>
      )}

      {tab === "Designations" && (
        <Section
          title="Designations"
          headers={["Name", "Department", ""]}
          empty={
            departments.length === 0
              ? "Add a department first, then create designations under it."
              : "No designations yet."
          }
          form={
            <AddForm action={createDesignation}>
              <Field label="Designation" htmlFor="desig-name" className="min-w-56">
                <Input id="desig-name" name="name" placeholder="e.g. Senior Developer" required />
              </Field>
              <Field label="Department" className="min-w-52">
                <Combobox name="departmentId" options={deptOptions} placeholder="Select department" />
              </Field>
            </AddForm>
          }
          rows={designations.map((d) => ({
            id: d.id,
            cells: [d.name, d.department.name],
            delete: <DeleteButton entity="designation" id={d.id} label={d.name} />,
          }))}
        />
      )}

      {tab === "Shifts" && (
        <Section
          title="Work shifts"
          headers={["Name", "Timing", "Grace", ""]}
          empty="No shifts yet."
          form={
            <AddForm action={createShift}>
              <Field label="Shift name" htmlFor="shift-name" className="min-w-48">
                <Input id="shift-name" name="name" placeholder="e.g. General" required />
              </Field>
              <Field label="Start" htmlFor="shift-start" className="w-40">
                <Input id="shift-start" name="startTime" type="time" defaultValue="09:00" required />
              </Field>
              <Field label="End" htmlFor="shift-end" className="w-40">
                <Input id="shift-end" name="endTime" type="time" defaultValue="18:00" required />
              </Field>
              <Field label="Grace (min)" htmlFor="shift-grace" className="w-32" hint="On-time window">
                <Input id="shift-grace" name="graceMinutes" type="number" min={0} max={180} defaultValue={0} />
              </Field>
            </AddForm>
          }
          rows={shifts.map((s) => ({
            id: s.id,
            cells: [
              s.name,
              `${s.startTime} – ${s.endTime}`,
              s.graceMinutes > 0 ? `${s.graceMinutes} min` : "—",
            ],
            delete: <DeleteButton entity="shift" id={s.id} label={s.name} />,
          }))}
        />
      )}

      {tab === "Locations" && (
        <div className="space-y-5">
          <MultiLocationToggle enabled={multiLocation} />
          <Section
            title="Locations"
            headers={["Name", ""]}
            empty="No locations yet."
            form={
              <AddForm action={createLocation}>
                <Field label="Location name" htmlFor="loc-name" className="min-w-64">
                  <Input id="loc-name" name="name" placeholder="e.g. Bengaluru HQ" required />
                </Field>
              </AddForm>
            }
            rows={locations.map((l) => ({
              id: l.id,
              cells: [l.name],
              delete: <DeleteButton entity="location" id={l.id} label={l.name} />,
            }))}
          />
        </div>
      )}

      {tab === "Probation" && (
        <Section
          title="Probation periods"
          headers={["Duration", ""]}
          empty="No probation periods yet."
          form={
            <AddForm action={createProbationPeriod}>
              <Field label="Months" htmlFor="prob-months" className="w-40">
                <Input id="prob-months" name="months" type="number" min={1} max={36} placeholder="e.g. 6" required />
              </Field>
            </AddForm>
          }
          rows={probationPeriods.map((p) => ({
            id: p.id,
            cells: [`${p.months} month${p.months > 1 ? "s" : ""}`],
            delete: <DeleteButton entity="probationPeriod" id={p.id} label={`${p.months} months`} />,
          }))}
        />
      )}

      {tab === "Access" && accessMatrix && <PermissionsMatrix initial={accessMatrix} />}
    </div>
  );
}

function MultiLocationToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-content">Multiple work locations</h3>
          <p className="mt-0.5 max-w-md text-sm text-muted">
            On: employees pick a location on their form. Off: the single location is
            auto-assigned and the field is hidden.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={pending}
          onClick={() => {
            const next = !on;
            setOn(next);
            start(async () => {
              const res = await setMultiLocation(next);
              if (res.error) {
                setOn(!next);
                alert(res.error);
              }
            });
          }}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            on ? "bg-brand-600" : "bg-line-strong",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
    </Card>
  );
}

function Section({
  title,
  form,
  rows,
  headers,
  empty,
}: {
  title: string;
  form: React.ReactNode;
  rows: { id: string; cells: string[]; delete: React.ReactNode }[];
  headers: string[];
  empty: string;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-content">Add {title.toLowerCase()}</h3>
        {form}
      </Card>

      <Card>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                {headers.map((h, i) => (
                  <th key={i} className="px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-canvas">
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      className={cn("px-5 py-3", i === 0 ? "font-medium text-content" : "text-muted")}
                    >
                      {c}
                    </td>
                  ))}
                  <td className="px-5 py-3 text-right">{r.delete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
