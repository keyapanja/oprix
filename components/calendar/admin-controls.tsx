"use client";

import { Fragment, useActionState, useEffect, useState } from "react";
import {
  createHoliday,
  createAnnouncement,
  type CalendarState,
} from "@/lib/calendar/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function CalendarAdminControls() {
  const [tab, setTab] = useState<"holiday" | "announcement">("holiday");

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4 inline-flex rounded-xl bg-canvas p-0.5">
        {(["holiday", "announcement"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
            )}
          >
            {t === "holiday" ? "Add holiday" : "Post announcement"}
          </button>
        ))}
      </div>

      {tab === "holiday" ? <HolidayForm /> : <AnnouncementForm />}
    </Card>
  );
}

function HolidayForm() {
  const [state, action, pending] = useActionState<CalendarState, FormData>(createHoliday, {});
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state.ok) setKey((k) => k + 1);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Fragment key={key}>
        <Field label="Date" className="w-44">
          <DatePicker name="date" />
        </Field>
        <Field label="Holiday name" htmlFor="h-name" className="min-w-56 flex-1">
          <Input id="h-name" name="name" placeholder="e.g. Independence Day" required />
        </Field>
      </Fragment>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add holiday"}</Button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function AnnouncementForm() {
  const [state, action, pending] = useActionState<CalendarState, FormData>(createAnnouncement, {});
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state.ok) setKey((k) => k + 1);
  }, [state]);

  return (
    <form action={action} className="space-y-3">
      <Fragment key={key}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Date" className="w-44">
            <DatePicker name="date" />
          </Field>
          <Field label="Title" htmlFor="a-title" className="min-w-56 flex-1">
            <Input id="a-title" name="title" placeholder="e.g. Office closed early Friday" required />
          </Field>
        </div>
        <Field label="Details" htmlFor="a-body">
          <Textarea id="a-body" name="body" placeholder="Optional details…" />
        </Field>
      </Fragment>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Icon name="bell" className="size-4" />
          {pending ? "Posting…" : "Post announcement"}
        </Button>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
