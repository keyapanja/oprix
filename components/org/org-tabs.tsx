"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { Icon } from "@/components/ui/icons";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { AddForm } from "@/components/org/add-form";
import { DeleteButton } from "@/components/org/delete-button";
import { ShiftEdit } from "@/components/org/shift-edit";
import { ServiceList } from "@/components/org/service-list";
import { PermissionsMatrix } from "@/components/org/permissions-matrix";
import { TaskScopeMatrix } from "@/components/org/task-scope-matrix";
import { CompanyInfoForm, type CompanyInfo } from "@/components/org/company-info-form";
import { DepartmentHead } from "@/components/org/department-head";
import { BulkSubcategoryForm } from "@/components/org/bulk-subcategory-form";
import {
  createDepartment,
  createService,
  createDesignation,
  createShift,
  createLocation,
  createProbationPeriod,
  setMultiLocation,
  deleteOrgEntities,
} from "@/lib/org/actions";
import { setEventReminder } from "@/lib/calendar/actions";
import { cn } from "@/lib/cn";

type Dept = { id: string; name: string; headId: string | null };
type Svc = {
  id: string;
  name: string;
  parentId: string | null;
  department: { name: string } | null;
  checklist: { id: string; text: string }[];
};
type Desig = { id: string; name: string; department: { name: string } };
type Shift = { id: string; name: string; startTime: string; endTime: string; graceMinutes: number };
type Loc = { id: string; name: string };
type Prob = { id: string; months: number };

const BASE_TABS = ["Company", "Departments", "Services", "Designations"];

export function OrgTabs({
  company,
  departments,
  employees,
  services,
  designations,
  shifts,
  locations,
  probationPeriods,
  multiLocation,
  eventReminder,
  accessMatrix,
  taskScopes,
}: {
  company: CompanyInfo;
  departments: Dept[];
  employees: { value: string; label: string }[];
  services: Svc[];
  designations: Desig[];
  shifts: Shift[];
  locations: Loc[];
  probationPeriods: Prob[];
  multiLocation: boolean;
  eventReminder: { enabled: boolean; time: string };
  accessMatrix: Record<string, string[]> | null;
  taskScopes: Record<string, string> | null;
}) {
  const [tab, setTab] = useState<string>("Company");
  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  // Only top-level services (categories) can parent a sub-category.
  const categoryOptions = services
    .filter((s) => !s.parentId)
    .map((s) => ({ value: s.id, label: s.name }));
  const tabs = [...BASE_TABS];
  if (accessMatrix) tabs.push("Access");
  if (taskScopes) tabs.push("Task access");

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

      {tab === "Company" && (
        <div className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-2">
          <CompanyInfoForm company={company} />

          <div className="space-y-8">
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-faint">Work shifts</h3>
            <Section
              title="Work shifts"
              bulkEntity="shift"
              bulkNoun="shift"
              headers={["Name", "Timing", ""]}
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
                </AddForm>
              }
              rows={shifts.map((s) => ({
                id: s.id,
                cells: [
                  s.name,
                  `${s.startTime} – ${s.endTime}`,
                ],
                delete: (
                  <div className="flex items-center justify-end gap-1">
                    <ShiftEdit shift={s} />
                    <DeleteButton entity="shift" id={s.id} label={s.name} />
                  </div>
                ),
              }))}
            />
          </div>

          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-faint">Locations</h3>
            <LocationsSettings enabled={multiLocation} locations={locations} />
          </div>

          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-faint">Probation periods</h3>
            <Section
              title="Probation periods"
              bulkEntity="probationPeriod"
              bulkNoun="probation period"
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
          </div>

          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-faint">Reminders</h3>
            <EventReminderSettings enabled={eventReminder.enabled} time={eventReminder.time} />
          </div>
          </div>
        </div>
      )}

      {tab === "Departments" && (
        <Section
          title="Departments"
          empty="No departments yet."
          headers={["Name", "Head", ""]}
          form={
            <AddForm action={createDepartment}>
              <Field label="Department name" htmlFor="dept-name" className="min-w-64">
                <Input id="dept-name" name="name" placeholder="e.g. Engineering" required />
              </Field>
            </AddForm>
          }
          rows={departments.map((d) => ({
            id: d.id,
            cells: [
              d.name,
              <DepartmentHead departmentId={d.id} headId={d.headId} employees={employees} />,
            ],
            delete: <DeleteButton entity="department" id={d.id} label={d.name} />,
          }))}
        />
      )}

      {tab === "Services" && (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Services are organized as <span className="font-medium text-content">categories</span> and{" "}
            <span className="font-medium text-content">sub-categories</span>. Projects link to categories;
            tasks are created under a sub-category, which seeds the task checklist.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-content">Add category</h3>
              <AddForm action={createService}>
                <Field label="Category name" htmlFor="cat-name" className="min-w-56">
                  <Input id="cat-name" name="name" placeholder="e.g. Web Development" required />
                </Field>
                <Field label="Department" className="min-w-52" hint="Sub-categories inherit this">
                  <Combobox name="departmentId" options={deptOptions} placeholder="— None —" emptyLabel="— None —" />
                </Field>
              </AddForm>
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-content">Add sub-categories</h3>
              {categoryOptions.length === 0 ? (
                <p className="text-sm text-muted">Add a category first, then create sub-categories under it.</p>
              ) : (
                <BulkSubcategoryForm categories={categoryOptions} />
              )}
            </Card>
          </div>
          <ServiceList
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              parentId: s.parentId,
              departmentName: s.department?.name ?? null,
              checklist: s.checklist,
            }))}
          />
        </div>
      )}

      {tab === "Designations" && (
        <Section
          title="Designations"
          bulkEntity="designation"
          bulkNoun="designation"
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

      {tab === "Access" && accessMatrix && <PermissionsMatrix initial={accessMatrix} />}

      {tab === "Task access" && taskScopes && <TaskScopeMatrix initial={taskScopes} />}
    </div>
  );
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        on ? "bg-brand-600" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function LocationsSettings({ enabled, locations }: { enabled: boolean; locations: Loc[] }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const bulk = useBulkDelete("location", "location");
  const allSel = locations.length > 0 && locations.every((l) => bulk.selected.has(l.id));
  // With a single location already set and multi-location off, there's nothing to add.
  const showAdd = on || locations.length === 0;

  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setMultiLocation(next);
      if (res.error) {
        setOn(!next);
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line p-5">
        <div>
          <h3 className="text-sm font-semibold text-content">Multiple work locations</h3>
          <p className="mt-0.5 max-w-md text-sm text-muted">
            On: employees pick a location on their form. Off: the single location is
            auto-assigned and the field is hidden.
          </p>
        </div>
        <Toggle on={on} disabled={pending} onClick={toggle} />
      </div>

      {showAdd && (
        <div className="border-b border-line p-5">
          <h3 className="mb-3 text-sm font-semibold text-content">Add location</h3>
          <AddForm action={createLocation}>
            <Field label="Location name" htmlFor="loc-name" className="min-w-64">
              <Input id="loc-name" name="name" placeholder="e.g. Bengaluru HQ" required />
            </Field>
          </AddForm>
        </div>
      )}

      {locations.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No locations yet.</p>
      ) : (
        <>
          <BulkBar count={bulk.selected.size} noun="location" pending={bulk.pending} onClear={bulk.clear} onDelete={bulk.run} />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="w-10 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={allSel}
                    onChange={() => bulk.toggleAll(locations.map((l) => l.id))}
                    className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {locations.map((l) => (
                <tr key={l.id} className={cn("hover:bg-canvas", bulk.selected.has(l.id) && "bg-accent-soft hover:bg-accent-soft")}>
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      checked={bulk.selected.has(l.id)}
                      onChange={() => bulk.toggle(l.id)}
                      className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                      aria-label={`Select ${l.name}`}
                    />
                  </td>
                  <td className="px-5 py-3 font-medium text-content">{l.name}</td>
                  <td className="px-5 py-3 text-right">
                    <DeleteButton entity="location" id={l.id} label={l.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function EventReminderSettings({ enabled, time }: { enabled: boolean; time: string }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [t, setT] = useState(time);
  const [pending, start] = useTransition();

  function persist(nextOn: boolean, nextTime: string) {
    start(async () => {
      const res = await setEventReminder({ enabled: nextOn, time: nextTime });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 p-5">
        <div>
          <h3 className="text-sm font-semibold text-content">Day-before reminders</h3>
          <p className="mt-0.5 max-w-md text-sm text-muted">
            Notify everyone the day before a holiday or announcement, at the time below (company timezone).
          </p>
        </div>
        <Toggle
          on={on}
          disabled={pending}
          onClick={() => {
            const next = !on;
            setOn(next);
            persist(next, t);
          }}
        />
      </div>
      {on && (
        <div className="flex items-center gap-3 border-t border-line p-5">
          <label htmlFor="reminder-time" className="text-sm font-medium text-content">
            Send at
          </label>
          <input
            id="reminder-time"
            type="time"
            value={t}
            onChange={(e) => setT(e.target.value)}
            onBlur={() => persist(on, t)}
            className="h-10 rounded-xl bg-surface px-3 text-sm text-content ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {pending && <span className="text-xs text-muted">Saving…</span>}
        </div>
      )}
    </Card>
  );
}

type OrgBulkEntity = "designation" | "shift" | "location" | "probationPeriod";

/** Shared multi-select + bulk-delete state for an org list. */
function useBulkDelete(entity: OrgBulkEntity, noun: string) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll(ids: string[]) {
    const all = ids.length > 0 && ids.every((i) => selected.has(i));
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((i) => (all ? n.delete(i) : n.add(i)));
      return n;
    });
  }
  function clear() {
    setSelected(new Set());
  }
  function run() {
    const ids = [...selected];
    if (!ids.length) return;
    void (async () => {
      const ok = await confirmDialog({
        message: `Delete ${ids.length} ${noun}${ids.length === 1 ? "" : "s"}? This can't be undone.`,
        tone: "danger",
        confirmLabel: "Delete",
      });
      if (!ok) return;
      start(async () => {
        const res = await deleteOrgEntities(entity, ids);
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        const del = res.deleted ?? 0;
        toast.success(
          `Deleted ${del} ${noun}${del === 1 ? "" : "s"}${res.skipped ? ` · ${res.skipped} in use, skipped` : ""}`,
        );
        clear();
        router.refresh();
      });
    })();
  }
  return { selected, toggle, toggleAll, clear, pending, run };
}

function BulkBar({
  count,
  noun,
  pending,
  onClear,
  onDelete,
}: {
  count: number;
  noun: string;
  pending: boolean;
  onClear: () => void;
  onDelete: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-elevated px-5 py-2.5">
      <span className="text-sm font-medium text-content">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      <div className="flex items-center gap-2">
        <button onClick={onClear} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-content">
          Clear
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          <Icon name="trash" className="size-4" />
          {pending ? "Deleting…" : "Delete selected"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  form,
  rows,
  headers,
  empty,
  bulkEntity,
  bulkNoun,
}: {
  title: string;
  form: React.ReactNode;
  rows: { id: string; cells: React.ReactNode[]; delete: React.ReactNode }[];
  headers: string[];
  empty: string;
  bulkEntity?: OrgBulkEntity;
  bulkNoun?: string;
}) {
  const bulk = useBulkDelete(bulkEntity ?? "designation", bulkNoun ?? "item");
  const selectable = !!bulkEntity;
  const allSel = rows.length > 0 && rows.every((r) => bulk.selected.has(r.id));
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-5">
        <h3 className="mb-3 text-sm font-semibold text-content">Add {title.toLowerCase()}</h3>
        {form}
      </div>

      {selectable && (
        <BulkBar count={bulk.selected.size} noun={bulkNoun ?? "item"} pending={bulk.pending} onClear={bulk.clear} onDelete={bulk.run} />
      )}

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
              {selectable && (
                <th className="w-10 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={allSel}
                    onChange={() => bulk.toggleAll(rows.map((r) => r.id))}
                    className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                    aria-label="Select all"
                  />
                </th>
              )}
              {headers.map((h, i) => (
                <th key={i} className="px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className={cn("hover:bg-canvas", bulk.selected.has(r.id) && "bg-accent-soft hover:bg-accent-soft")}>
                {selectable && (
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      checked={bulk.selected.has(r.id)}
                      onChange={() => bulk.toggle(r.id)}
                      className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                      aria-label="Select row"
                    />
                  </td>
                )}
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
  );
}
