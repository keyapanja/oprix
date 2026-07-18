"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { updateForm } from "@/lib/forms/actions";
import {
  FIELD_CATALOG,
  WIDTH_SPAN_CLASS,
  fieldMeta,
  isInputField,
  makeField,
  type FieldDef,
  type FieldMeta,
  type FieldType,
} from "@/lib/forms/types";
import { EDITABLE_ROLES, ROLE_LABELS } from "@/lib/auth/can";
import { WEEKDAY_LABELS, type FormNotifySchedule, type ScheduleFrequency } from "@/lib/forms/schedule";
import { FieldInput } from "@/components/forms/field-input";
import { FieldConfigPanel } from "@/components/forms/field-config-panel";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { BackLink } from "@/components/ui/back-link";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type Initial = {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  schema: { fields: FieldDef[]; defaultGroupBy?: string };
  audienceRoles: string[];
  viewAllRoles: string[];
  portalEnabled: boolean;
  allowMultiple: boolean;
  notifyEnabled: boolean;
  notifySchedule: FormNotifySchedule | null;
};

const STATUS_OPTS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "CLOSED", label: "Closed" },
];

const FREQ_OPTS = [
  { value: "ONCE", label: "One time" },
  { value: "DAILY", label: "Every day" },
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY", label: "Every month" },
];
const WEEKDAY_OPTS = WEEKDAY_LABELS.map((l, i) => ({ value: String(i), label: l }));

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

// ---- palette item (draggable + click to add) ------------------------------
function PaletteItem({ meta, onAdd }: { meta: FieldMeta; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${meta.type}` });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onAdd}
      className={cn(
        "flex w-full cursor-grab items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-content ring-1 ring-inset ring-line transition-colors hover:bg-canvas active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Icon name={meta.icon} className="size-4 shrink-0 text-faint" />
      {meta.label}
    </button>
  );
}

// ---- one sortable field card on the canvas --------------------------------
function SortableField({
  field,
  selected,
  onSelect,
}: {
  field: FieldDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  // Translate only — CSS.Transform adds scaleX/scaleY to morph between different-
  // sized fields, which stretches the card's content on the variable-width grid.
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    // The whole card is the drag handle (grab anywhere to reorder); a click that
    // doesn't move selects the field for editing. dnd-kit's 5px activation
    // distance separates the two.
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab touch-none rounded-xl border bg-surface p-4 transition-shadow active:cursor-grabbing",
        WIDTH_SPAN_CLASS[field.width ?? "full"],
        selected ? "border-brand-500 ring-1 ring-brand-500" : "border-line hover:border-line-strong",
        isDragging && "opacity-50 shadow-card-hover",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-faint">
        <Icon name="grip" className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{fieldMeta(field.type).label}</span>
      </div>
      <FieldInput field={field} disabled />
    </div>
  );
}

export function FormBuilder({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [status, setStatus] = useState(initial.status);
  const [fields, setFields] = useState<FieldDef[]>(initial.schema.fields);
  const [audienceRoles, setAudienceRoles] = useState<string[]>(initial.audienceRoles);
  const [viewAllRoles, setViewAllRoles] = useState<string[]>(initial.viewAllRoles);
  const [portalEnabled, setPortalEnabled] = useState(initial.portalEnabled);
  const [allowMultiple, setAllowMultiple] = useState(initial.allowMultiple);
  const [defaultGroupBy, setDefaultGroupBy] = useState(initial.schema.defaultGroupBy ?? "");
  const [notifyEnabled, setNotifyEnabled] = useState(initial.notifyEnabled);
  const [notifyFreq, setNotifyFreq] = useState<ScheduleFrequency>(initial.notifySchedule?.frequency ?? "WEEKLY");
  const [notifyTime, setNotifyTime] = useState(initial.notifySchedule?.time ?? "09:00");
  const [notifyWeekday, setNotifyWeekday] = useState(initial.notifySchedule?.weekday ?? 1);
  const [notifyMonthday, setNotifyMonthday] = useState(initial.notifySchedule?.monthday ?? 1);
  const [notifyDate, setNotifyDate] = useState(initial.notifySchedule?.date ?? "");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"field" | "settings">("settings");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { setNodeRef: setCanvasRef } = useDroppable({ id: "canvas" });
  const selected = useMemo(() => fields.find((f) => f.id === selectedId) ?? null, [fields, selectedId]);

  function select(id: string) {
    setSelectedId(id);
    setRightTab("field");
  }
  function addField(type: FieldType) {
    const nf = makeField(type);
    setFields((p) => [...p, nf]);
    select(nf.id);
  }
  function patchField(id: string, patch: Partial<FieldDef>) {
    setFields((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function deleteField(id: string) {
    setFields((p) => p.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  function duplicateField(id: string) {
    setFields((p) => {
      const i = p.findIndex((f) => f.id === id);
      if (i === -1) return p;
      const copy = makeField(p[i].type);
      const clone: FieldDef = { ...p[i], id: copy.id, options: p[i].options?.map((o) => ({ ...o, id: copy.id + o.label })) };
      return [...p.slice(0, i + 1), clone, ...p.slice(i + 1)];
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const a = String(active.id);
    if (a.startsWith("palette:")) {
      const type = a.slice("palette:".length) as FieldType;
      const nf = makeField(type);
      setFields((prev) => {
        const idx = prev.findIndex((f) => f.id === String(over.id));
        return idx === -1 ? [...prev, nf] : [...prev.slice(0, idx), nf, ...prev.slice(idx)];
      });
      select(nf.id);
      return;
    }
    if (a !== String(over.id)) {
      setFields((prev) => {
        const from = prev.findIndex((f) => f.id === a);
        const to = prev.findIndex((f) => f.id === String(over.id));
        return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
      });
    }
  }

  function save() {
    if (!title.trim()) {
      toast.error("Give the form a title.");
      return;
    }
    if (notifyEnabled && notifyFreq === "ONCE" && !notifyDate) {
      toast.error("Pick a date for the one-time reminder.");
      return;
    }
    const notifySchedule: FormNotifySchedule | null = notifyEnabled
      ? {
          frequency: notifyFreq,
          time: notifyTime,
          ...(notifyFreq === "WEEKLY" ? { weekday: notifyWeekday } : {}),
          ...(notifyFreq === "MONTHLY" ? { monthday: notifyMonthday } : {}),
          ...(notifyFreq === "ONCE" ? { date: notifyDate } : {}),
        }
      : null;
    start(async () => {
      const res = await updateForm({
        id: initial.id,
        title: title.trim(),
        description: description.trim() || null,
        schema: { fields, defaultGroupBy: defaultGroupBy || undefined },
        audienceRoles,
        viewAllRoles,
        portalEnabled,
        allowMultiple,
        status,
        notifyEnabled,
        notifySchedule,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Form saved");
      router.refresh();
    });
  }

  const overlayMeta = activeId?.startsWith("palette:") ? fieldMeta(activeId.slice(8) as FieldType) : null;
  const groupChoices = [
    { value: "", label: "No grouping" },
    { value: "__submitter", label: "Submitter" },
    ...fields.filter((f) => isInputField(f.type)).map((f) => ({ value: f.id, label: f.label || "(untitled)" })),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/forms">Back to forms</BackLink>
        <div className="flex items-center gap-2">
          <a href={`/forms/${initial.id}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              <Icon name="eye" className="size-4" />
              Preview
            </Button>
          </a>
          <Button onClick={save} disabled={pending} size="sm">
            {pending ? "Saving…" : "Save form"}
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
          {/* Palette */}
          <Card className="h-fit p-3 lg:sticky lg:top-4">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-faint">Fields</p>
            <div className="space-y-1.5">
              {FIELD_CATALOG.map((m) => (
                <PaletteItem key={m.type} meta={m} onAdd={() => addField(m.type)} />
              ))}
            </div>
          </Card>

          {/* Canvas */}
          <div ref={setCanvasRef}>
            <Card className="p-5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled form"
                className="w-full bg-transparent text-xl font-semibold text-content placeholder:text-faint focus:outline-none"
              />
              <div className="mt-4">
                {fields.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-line py-16 text-center text-sm text-muted">
                    Drag a field here, or click one from the left to start building.
                  </div>
                ) : (
                  <SortableContext items={fields.map((f) => f.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-12">
                      {fields.map((f) => (
                        <SortableField key={f.id} field={f} selected={f.id === selectedId} onSelect={() => select(f.id)} />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </div>
            </Card>
          </div>

          {/* Right panel */}
          <Card className="h-fit p-4 lg:sticky lg:top-4">
            <div className="mb-3 flex rounded-lg bg-canvas p-0.5 text-sm">
              {(["settings", "field"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 font-medium capitalize transition-colors",
                    rightTab === t ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
                  )}
                >
                  {t === "settings" ? "Form" : "Field"}
                </button>
              ))}
            </div>

            {rightTab === "field" ? (
              selected ? (
                <FieldConfigPanel
                  field={selected}
                  siblings={fields}
                  onChange={(patch) => patchField(selected.id, patch)}
                  onDelete={() => deleteField(selected.id)}
                  onDuplicate={() => duplicateField(selected.id)}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted">Select a field to edit it.</p>
              )
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Description</span>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown at the top of the form" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Status</span>
                  <Combobox value={status} onChange={(v) => setStatus(v as Initial["status"])} options={STATUS_OPTS} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Default entries grouping</span>
                  <Combobox value={defaultGroupBy} onChange={setDefaultGroupBy} options={groupChoices} />
                  <span className="mt-1 block text-xs text-muted">How the entries table groups by default — viewers can still change it.</span>
                </label>

                <div className="border-t border-line pt-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Who can fill this</p>
                  <div className="space-y-1.5">
                    {EDITABLE_ROLES.map((r) => (
                      <label key={r} className="flex items-center justify-between text-sm text-content">
                        {ROLE_LABELS[r] ?? r}
                        <input
                          type="checkbox"
                          checked={audienceRoles.includes(r)}
                          onChange={() => {
                            const removing = audienceRoles.includes(r);
                            setAudienceRoles((cur) => toggle(cur, r));
                            if (removing) setViewAllRoles((cur) => cur.filter((x) => x !== r));
                          }}
                          className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                        />
                      </label>
                    ))}
                  </div>
                  <label className="mt-2 flex items-center justify-between text-sm text-content">
                    Client portal
                    <input
                      type="checkbox"
                      checked={portalEnabled}
                      onChange={(e) => setPortalEnabled(e.target.checked)}
                      className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                    />
                  </label>
                </div>

                {audienceRoles.length > 0 && (
                  <div className="border-t border-line pt-3">
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Can see all entries</p>
                    <p className="mb-2 text-xs text-muted">Others see only their own.</p>
                    <div className="space-y-1.5">
                      {EDITABLE_ROLES.filter((r) => audienceRoles.includes(r)).map((r) => (
                        <label key={r} className="flex items-center justify-between text-sm text-content">
                          {ROLE_LABELS[r] ?? r}
                          <input
                            type="checkbox"
                            checked={viewAllRoles.includes(r)}
                            onChange={() => setViewAllRoles((cur) => toggle(cur, r))}
                            className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between border-t border-line pt-3 text-sm text-content">
                  Allow multiple submissions
                  <input
                    type="checkbox"
                    checked={allowMultiple}
                    onChange={(e) => setAllowMultiple(e.target.checked)}
                    className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                  />
                </label>

                <div className="space-y-2 border-t border-line pt-3">
                  <label className="flex items-center justify-between text-sm text-content">
                    Send fill-out reminders
                    <input
                      type="checkbox"
                      checked={notifyEnabled}
                      onChange={(e) => setNotifyEnabled(e.target.checked)}
                      className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                    />
                  </label>
                  {notifyEnabled && (
                    <div className="space-y-2 rounded-lg p-2.5 ring-1 ring-inset ring-line">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted">Frequency</span>
                        <Combobox value={notifyFreq} onChange={(v) => setNotifyFreq(v as ScheduleFrequency)} options={FREQ_OPTS} />
                      </label>
                      {notifyFreq === "WEEKLY" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-muted">Day of week</span>
                          <Combobox value={String(notifyWeekday)} onChange={(v) => setNotifyWeekday(Number(v))} options={WEEKDAY_OPTS} />
                        </label>
                      )}
                      {notifyFreq === "MONTHLY" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-muted">Day of month</span>
                          <Input
                            type="number"
                            value={notifyMonthday}
                            onChange={(e) => setNotifyMonthday(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                          />
                        </label>
                      )}
                      {notifyFreq === "ONCE" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-muted">Date</span>
                          <DatePicker value={notifyDate} onChange={setNotifyDate} />
                        </label>
                      )}
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted">Time</span>
                        <Input type="time" value={notifyTime} onChange={(e) => setNotifyTime(e.target.value)} />
                      </label>
                      <p className="text-xs text-muted">
                        Notifies everyone in the form&apos;s audience roles to fill it out. Times are in the company timezone.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        <DragOverlay>
          {overlayMeta ? (
            <div className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2 text-sm text-content shadow-card-hover ring-1 ring-line">
              <Icon name={overlayMeta.icon} className="size-4 text-faint" />
              {overlayMeta.label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
