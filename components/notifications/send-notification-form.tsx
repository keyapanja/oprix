"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendManualNotification } from "@/lib/notifications/broadcast";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type Dept = { id: string; name: string };
type Emp = { id: string; name: string; department: string | null };
type Audience = "all" | "departments" | "employees";

export function SendNotificationForm({ departments, employees }: { departments: Dept[]; employees: Emp[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [empIds, setEmpIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const availableEmployees = useMemo(() => employees.filter((e) => !empIds.includes(e.id)), [employees, empIds]);

  function toggleDept(id: string) {
    setDeptIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  function addEmp(id: string) {
    if (id && !empIds.includes(id)) setEmpIds((l) => [...l, id]);
  }
  function removeEmp(id: string) {
    setEmpIds((l) => l.filter((x) => x !== id));
  }

  function send() {
    setError(null);
    if (!title.trim()) return setError("Add a title.");
    if (!body.trim()) return setError("Add a message.");
    if (audience === "departments" && deptIds.length === 0) return setError("Pick at least one department.");
    if (audience === "employees" && empIds.length === 0) return setError("Pick at least one person.");
    start(async () => {
      const res = await sendManualNotification({
        title: title.trim(),
        body: body.trim(),
        audience,
        departmentIds: audience === "departments" ? deptIds : undefined,
        employeeIds: audience === "employees" ? empIds : undefined,
      });
      if (res.error) return setError(res.error);
      toast.success(`Notification sent to ${res.sent} ${res.sent === 1 ? "person" : "people"}.`);
      setTitle("");
      setBody("");
      setDeptIds([]);
      setEmpIds([]);
      setAudience("all");
      router.refresh();
    });
  }

  const AUDIENCE_OPTS: { value: Audience; label: string; hint: string }[] = [
    { value: "all", label: "Everyone", hint: "All employees with a login" },
    { value: "departments", label: "By department", hint: "Pick one or more departments" },
    { value: "employees", label: "Specific people", hint: "Pick individual employees" },
  ];

  return (
    <Card className="p-6">
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <Field label="Title" htmlFor="sn-title" required>
          <Input id="sn-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed Friday" />
        </Field>
        <Field label="Message" htmlFor="sn-body" required>
          <Textarea
            id="sn-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What do you want to tell them?"
            className="min-h-24"
          />
        </Field>

        <Field label="Send to">
          <div className="grid gap-2 sm:grid-cols-3">
            {AUDIENCE_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAudience(o.value)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  audience === o.value
                    ? "border-brand-500 bg-accent-soft/40 ring-1 ring-inset ring-brand-500/30"
                    : "border-line hover:bg-canvas",
                )}
              >
                <p className="text-sm font-medium text-content">{o.label}</p>
                <p className="text-xs text-muted">{o.hint}</p>
              </button>
            ))}
          </div>
        </Field>

        {audience === "departments" && (
          <Field label="Departments">
            {departments.length === 0 ? (
              <p className="text-sm text-muted">No departments yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => (
                  <label
                    key={d.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition-colors",
                      deptIds.includes(d.id)
                        ? "bg-accent-soft text-accent-strong ring-brand-500/30"
                        : "bg-canvas text-content ring-line hover:bg-surface",
                    )}
                  >
                    <input type="checkbox" checked={deptIds.includes(d.id)} onChange={() => toggleDept(d.id)} className="sr-only" />
                    {deptIds.includes(d.id) && <Icon name="check" className="size-3.5" />}
                    {d.name}
                  </label>
                ))}
              </div>
            )}
          </Field>
        )}

        {audience === "employees" && (
          <Field label="People">
            <div className="flex flex-wrap items-center gap-2">
              {empIds.map((id) => {
                const emp = empById.get(id);
                if (!emp) return null;
                return (
                  <span key={id} className="flex items-center gap-1.5 rounded-full bg-canvas py-1 pl-1 pr-2 text-sm text-content">
                    <span className="gradient-brand flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </span>
                    {emp.name}
                    <button type="button" onClick={() => removeEmp(id)} className="text-faint hover:text-red-600" aria-label={`Remove ${emp.name}`}>
                      <Icon name="x" className="size-3.5" />
                    </button>
                  </span>
                );
              })}
              {availableEmployees.length > 0 && (
                <div className="w-56">
                  <Combobox
                    value=""
                    onChange={addEmp}
                    placeholder="+ Add person"
                    options={availableEmployees.map((e) => ({ value: e.id, label: e.department ? `${e.name} · ${e.department}` : e.name }))}
                  />
                </div>
              )}
            </div>
          </Field>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button onClick={send} disabled={pending}>
            <Icon name="bell" className="size-4" />
            {pending ? "Sending…" : "Send notification"}
          </Button>
          <span className="text-xs text-muted">Delivered to the in-app bell + browser push (no email).</span>
        </div>
      </div>
    </Card>
  );
}
