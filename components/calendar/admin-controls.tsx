"use client";

import { Fragment, useActionState, useEffect, useState } from "react";
import { createHoliday, type CalendarState } from "@/lib/calendar/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { AnnouncementForm } from "@/components/calendar/announcement-form";
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
