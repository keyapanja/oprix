"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createProject, type ProjectState } from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { humanizeEnum } from "@/lib/format";

type Opt = { id: string; name: string };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];

export function ProjectForm({ clients, services }: { clients: Opt[]; services: Opt[] }) {
  const [state, formAction, pending] = useActionState<ProjectState, FormData>(
    createProject,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" htmlFor="p-name" required className="sm:col-span-2">
            <Input id="p-name" name="name" placeholder="Website redesign" required />
          </Field>
          <Field label="Client">
            <Combobox name="clientId" emptyLabel="— None —" placeholder="— None —" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Priority">
            <Combobox name="priority" defaultValue="MEDIUM" options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
          </Field>
          <Field label="Start date">
            <DatePicker name="startDate" />
          </Field>
          <Field label="Due date">
            <DatePicker name="dueDate" />
          </Field>
          <Field label="Status">
            <Combobox name="status" defaultValue="PLANNING" options={STATUSES.map((s) => ({ value: s, label: humanizeEnum(s) }))} />
          </Field>
          <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
            <Textarea id="p-desc" name="description" placeholder="What's this project about?" />
          </Field>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium text-content">Services</p>
          {services.length === 0 ? (
            <p className="text-sm text-muted">
              No services yet — add them in Organization → Services.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-sm text-content hover:bg-canvas"
                >
                  <input type="checkbox" name="serviceIds" value={s.id} className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500" />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/projects">
          <Button type="button" variant="secondary">Cancel</Button>
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
