"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRecurringTask,
  toggleRecurringTask,
  deleteRecurringTask,
  runRecurringNow,
} from "@/lib/tasks/recurring-actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { humanizeEnum } from "@/lib/format";
import { WEEKDAY_LABELS, type ScheduleFrequency, type FormNotifySchedule } from "@/lib/forms/schedule";

type Emp = { id: string; name: string };
type SubCat = { id: string; name: string; categoryName: string; primaryAssigneeId: string | null };
type Proj = { id: string; name: string; subcategories: SubCat[] };

type Item = {
  id: string;
  name: string;
  description: string | null;
  projectName: string;
  taskType: string | null;
  priority: string;
  assigneeNames: string[];
  dueInDays: number | null;
  clientDeadlineInDays: number | null;
  checklistEnabled: boolean;
  active: boolean;
  scheduleLabel: string;
  lastRunKey: string | null;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const FREQ_OPTS: { value: ScheduleFrequency; label: string }[] = [
  { value: "DAILY", label: "Every day" },
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY", label: "Every month" },
  { value: "ONCE", label: "Once (on a date)" },
];
const WEEKDAY_OPTS = WEEKDAY_LABELS.map((l, i) => ({ value: String(i), label: l }));

export function RecurringTasks({
  items,
  projects,
  employees,
}: {
  items: Item[];
  projects: Proj[];
  employees: Emp[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(items.length === 0);

  // ---- form state ----
  const [projectId, setProjectId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueInDays, setDueInDays] = useState("");
  const [clientDeadlineInDays, setClientDeadlineInDays] = useState("");
  const [noChecklist, setNoChecklist] = useState(false);

  // schedule
  const [freq, setFreq] = useState<ScheduleFrequency>("WEEKLY");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [monthday, setMonthday] = useState(1);
  const [onceDate, setOnceDate] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const taskTypeOptions = useMemo(
    () => (project ? project.subcategories.map((s) => ({ value: s.id, label: `${s.categoryName} › ${s.name}` })) : []),
    [project],
  );
  const availableAssignees = useMemo(
    () => employees.filter((e) => !assigneeIds.includes(e.id)),
    [employees, assigneeIds],
  );

  function onProjectChange(v: string) {
    setProjectId(v);
    setServiceId("");
    setAssigneeIds([]);
  }
  function onTaskTypeChange(v: string) {
    setServiceId(v);
    const sub = project?.subcategories.find((s) => s.id === v);
    const pid = sub?.primaryAssigneeId;
    if (pid && employees.some((e) => e.id === pid)) {
      setAssigneeIds((cur) => (cur.includes(pid) ? cur : [...cur, pid]));
    }
  }
  function addAssignee(id: string) {
    if (id && !assigneeIds.includes(id)) setAssigneeIds((l) => [...l, id]);
  }
  function removeAssignee(id: string) {
    setAssigneeIds((l) => l.filter((x) => x !== id));
  }

  function resetForm() {
    setProjectId("");
    setServiceId("");
    setName("");
    setDescription("");
    setPriority("MEDIUM");
    setAssigneeIds([]);
    setDueInDays("");
    setClientDeadlineInDays("");
    setNoChecklist(false);
    setFreq("WEEKLY");
    setTime("09:00");
    setWeekday(1);
    setMonthday(1);
    setOnceDate("");
    setError(null);
  }

  function buildSchedule(): FormNotifySchedule {
    return {
      frequency: freq,
      time,
      ...(freq === "WEEKLY" ? { weekday } : {}),
      ...(freq === "MONTHLY" ? { monthday } : {}),
      ...(freq === "ONCE" ? { date: onceDate } : {}),
    };
  }

  function submit() {
    setError(null);
    if (!projectId) return setError("Pick a project");
    if (!name.trim()) return setError("Give the task a name");
    if (freq === "ONCE" && !onceDate) return setError("Pick the date for the one-time task");
    start(async () => {
      try {
        const res = await createRecurringTask({
          projectId,
          serviceId: serviceId || null,
          name: name.trim(),
          description: description.trim() || null,
          priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          assigneeIds,
          dueInDays: dueInDays === "" ? null : Math.max(0, Number(dueInDays) || 0),
          clientDeadlineInDays: clientDeadlineInDays === "" ? null : Math.max(0, Number(clientDeadlineInDays) || 0),
          checklistEnabled: !noChecklist,
          schedule: buildSchedule(),
        });
        if (res.error) return setError(res.error);
        toast.success("Recurring task saved");
        resetForm();
        setShowForm(false);
        router.refresh();
      } catch {
        setError(
          "Couldn't save. If this keeps happening, the database may be missing a recent update — run “npx prisma db push” (local) or redeploy (prod).",
        );
      }
    });
  }

  async function onToggle(it: Item) {
    setBusyId(it.id);
    const res = await toggleRecurringTask(it.id, !it.active);
    setBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success(it.active ? "Paused" : "Resumed");
    router.refresh();
  }

  async function onRunNow(it: Item) {
    if (!(await confirmDialog({ message: `Create “${it.name}” now, in addition to its schedule?`, confirmLabel: "Create now" })))
      return;
    setBusyId(it.id);
    const res = await runRecurringNow(it.id);
    setBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success("Task created");
    router.refresh();
  }

  async function onDelete(it: Item) {
    if (
      !(await confirmDialog({
        title: "Delete recurring task",
        message: `Stop creating “${it.name}”? Tasks already created stay untouched.`,
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    setBusyId(it.id);
    const res = await deleteRecurringTask(it.id);
    setBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success("Deleted");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Existing templates */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content">
          {items.length} recurring {items.length === 1 ? "task" : "tasks"}
        </h2>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Icon name="plus" className="size-4" /> New recurring task
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((it) => (
            <Card key={it.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-content">{it.name}</span>
                    <span
                      className={
                        it.active
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25"
                          : "rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-line"
                      }
                    >
                      {it.active ? "Active" : "Paused"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25">
                      <Icon name="clock" className="size-3" /> {it.scheduleLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>
                      <span className="text-faint">Project:</span> {it.projectName}
                      {it.taskType ? ` · ${it.taskType}` : ""}
                    </span>
                    <span>
                      <span className="text-faint">Priority:</span> {humanizeEnum(it.priority)}
                    </span>
                    {it.dueInDays != null && (
                      <span>
                        <span className="text-faint">Due:</span> {it.dueInDays === 0 ? "same day" : `+${it.dueInDays}d`}
                      </span>
                    )}
                    <span>
                      <span className="text-faint">Assignees:</span>{" "}
                      {it.assigneeNames.length ? it.assigneeNames.join(", ") : "—"}
                    </span>
                    {it.lastRunKey && (
                      <span>
                        <span className="text-faint">Last created:</span> {it.lastRunKey}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => onRunNow(it)} disabled={busyId === it.id}>
                    Run now
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onToggle(it)} disabled={busyId === it.id}>
                    {it.active ? "Pause" : "Resume"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => onDelete(it)}
                    disabled={busyId === it.id}
                    className="rounded-lg p-2 text-faint transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
                    aria-label="Delete recurring task"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {items.length === 0 && !showForm && (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">No recurring tasks yet.</p>
        </Card>
      )}

      {/* New recurring task form */}
      {showForm && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content">New recurring task</h2>
            {items.length > 0 && (
              <button type="button" onClick={() => setShowForm(false)} className="text-faint hover:text-content" aria-label="Close">
                <Icon name="x" className="size-4" />
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" required>
              <Combobox
                value={projectId}
                onChange={onProjectChange}
                placeholder="Select project"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field
              label="Task type"
              hint={!projectId ? "Pick a project first" : taskTypeOptions.length ? undefined : "This project has no task types"}
            >
              <Combobox
                value={serviceId}
                onChange={onTaskTypeChange}
                disabled={!projectId}
                emptyLabel="— None —"
                placeholder={projectId ? "— None —" : "—"}
                options={taskTypeOptions}
              />
            </Field>

            <Field label="Task title" htmlFor="r-name" required className="sm:col-span-2">
              <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly performance report" />
            </Field>
            <Field label="Description" htmlFor="r-desc" className="sm:col-span-2">
              <Textarea
                id="r-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What needs to be done each time…"
              />
            </Field>

            {/* Schedule editor */}
            <Field label="Repeat" className="sm:col-span-2">
              <div className="grid gap-3 rounded-xl p-3 ring-1 ring-inset ring-line sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Frequency</span>
                  <Combobox value={freq} onChange={(v) => setFreq(v as ScheduleFrequency)} options={FREQ_OPTS} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Time</span>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </label>
                {freq === "WEEKLY" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Day of week</span>
                    <Combobox value={String(weekday)} onChange={(v) => setWeekday(Number(v))} options={WEEKDAY_OPTS} />
                  </label>
                )}
                {freq === "MONTHLY" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Day of month</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={monthday}
                      onChange={(e) => setMonthday(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                    />
                    <span className="mt-1 block text-[11px] text-faint">Short months clamp to their last day.</span>
                  </label>
                )}
                {freq === "ONCE" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Date</span>
                    <DatePicker value={onceDate} onChange={setOnceDate} />
                  </label>
                )}
                <p className="text-xs text-muted sm:col-span-2">
                  The task is created automatically at this time (company timezone). It shows up for the assignees just like a normal task.
                </p>
              </div>
            </Field>

            <Field label="Priority">
              <Combobox value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
            </Field>
            <div />

            <Field label="Due date" hint="Days after each task is created (blank = no due date)">
              <Input
                type="number"
                min={0}
                value={dueInDays}
                onChange={(e) => setDueInDays(e.target.value)}
                placeholder="e.g. 2"
              />
            </Field>
            <Field label="Client deadline" hint="Days after each task is created (blank = none)">
              <Input
                type="number"
                min={0}
                value={clientDeadlineInDays}
                onChange={(e) => setClientDeadlineInDays(e.target.value)}
                placeholder="e.g. 3"
              />
            </Field>

            {/* Assignees */}
            <Field label="Assignees" hint="Who this task is assigned to each time" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                {assigneeIds.length === 0 && <span className="text-sm text-muted">No one assigned yet</span>}
                {assigneeIds.map((id) => {
                  const emp = empById.get(id);
                  if (!emp) return null;
                  return (
                    <span key={id} className="flex items-center gap-1.5 rounded-full bg-canvas py-1 pl-1 pr-2 text-sm text-content">
                      <span className="gradient-brand flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                        {emp.name.slice(0, 2).toUpperCase()}
                      </span>
                      {emp.name}
                      <button type="button" onClick={() => removeAssignee(id)} className="text-faint hover:text-red-600" aria-label={`Remove ${emp.name}`}>
                        <Icon name="x" className="size-3.5" />
                      </button>
                    </span>
                  );
                })}
                {availableAssignees.length > 0 && (
                  <div className="w-52">
                    <Combobox
                      value=""
                      onChange={addAssignee}
                      placeholder="+ Add assignee"
                      options={availableAssignees.map((e) => ({ value: e.id, label: e.name }))}
                    />
                  </div>
                )}
              </div>
            </Field>

            <Field label="Checklist" className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  checked={noChecklist}
                  onChange={(e) => setNoChecklist(e.target.checked)}
                  className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                />
                No checklist
              </label>
              {!noChecklist && (
                <p className="mt-1 text-xs text-muted">Each created task gets the task type&apos;s default checklist automatically.</p>
              )}
            </Field>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            {items.length > 0 && (
              <Button variant="secondary" onClick={() => { resetForm(); setShowForm(false); }}>
                Cancel
              </Button>
            )}
            <Button onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save recurring task"}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
