"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateHoliday, deleteHoliday } from "@/lib/calendar/actions";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

type Holiday = { id: string; name: string; dateISO: string };

export function HolidayActions({ holiday }: { holiday: Holiday }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(holiday.name);
  const [date, setDate] = useState(holiday.dateISO);

  function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required");
    const fd = new FormData();
    fd.set("name", name);
    fd.set("date", date);
    start(async () => {
      const res = await updateHoliday(holiday.id, fd);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        toast.success("Holiday updated");
        router.refresh();
      }
    });
  }

  async function onDelete() {
    const ok = await confirmDialog({
      message: `Delete the "${holiday.name}" holiday? This can't be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      try {
        const res = await deleteHoliday(holiday.id);
        if (res?.error) toast.error(res.error);
        else {
          toast.success("Holiday deleted");
          router.refresh();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the holiday.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded p-1 text-faint transition-colors hover:bg-canvas hover:text-content"
          aria-label="Edit holiday"
        >
          <Icon name="pencil" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded p-1 text-faint transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
          aria-label="Delete holiday"
        >
          <Icon name="trash" className="size-3.5" />
        </button>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Edit holiday">
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
                {error}
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <Field label="Date" className="w-44">
                <DatePicker value={date} onChange={setDate} />
              </Field>
              <Field label="Holiday name" className="min-w-56 flex-1">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={pending || !name.trim()}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
