"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { ApplyForm } from "@/components/leave/apply-form";
import {
  createHoliday,
  createAnnouncement,
  type CalendarState,
} from "@/lib/calendar/actions";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type Balance = {
  typeId: string;
  name: string;
  remaining: number;
  allowance: number;
  period: "MONTH" | "YEAR";
};
type Mode = "leave" | "holiday" | "announcement";

export function DateActionModal({
  start,
  end,
  onClose,
  canManage,
  canApplyLeave,
  balances,
}: {
  start: string;
  end: string;
  onClose: () => void;
  canManage: boolean;
  canApplyLeave: boolean;
  balances: Balance[];
}) {
  const router = useRouter();
  const done = () => {
    router.refresh();
    onClose();
  };

  const modes: Mode[] = [
    ...(canApplyLeave ? (["leave"] as Mode[]) : []),
    ...(canManage ? (["holiday", "announcement"] as Mode[]) : []),
  ];
  const [mode, setMode] = useState<Mode>(modes[0] ?? "leave");

  const title = start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;

  return (
    <Modal onClose={onClose} title={title}>
      {modes.length > 1 && (
        <div className="mb-4 inline-flex rounded-xl bg-canvas p-0.5">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
              )}
            >
              {m === "leave" ? "Apply leave" : m === "holiday" ? "Add holiday" : "Announcement"}
            </button>
          ))}
        </div>
      )}

      {mode === "leave" && (
        <ApplyForm bare balances={balances} initialStart={start} initialEnd={end} onDone={done} />
      )}
      {mode === "holiday" && <HolidayForm date={start} onDone={done} />}
      {mode === "announcement" && <AnnouncementForm date={start} onDone={done} />}
    </Modal>
  );
}

function ErrBox({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
      {msg}
    </div>
  );
}

function HolidayForm({ date, onDone }: { date: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<CalendarState, FormData>(createHoliday, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <ErrBox msg={state.error} />
      <Field label="Date" required>
        <DatePicker name="date" defaultValue={date} />
      </Field>
      <Field label="Holiday name" htmlFor="hm-name" required>
        <Input id="hm-name" name="name" placeholder="e.g. Independence Day" required />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add holiday"}</Button>
      </div>
    </form>
  );
}

function AnnouncementForm({ date, onDone }: { date: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<CalendarState, FormData>(createAnnouncement, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <ErrBox msg={state.error} />
      <Field label="Date" required>
        <DatePicker name="date" defaultValue={date} />
      </Field>
      <Field label="Title" htmlFor="am-title" required>
        <Input id="am-title" name="title" placeholder="e.g. Bollywood theme party" required />
      </Field>
      <Field label="Details" htmlFor="am-body">
        <Textarea id="am-body" name="body" placeholder="Optional details…" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Posting…" : "Post announcement"}</Button>
      </div>
    </form>
  );
}
