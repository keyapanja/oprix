"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient, type ClientState } from "@/lib/clients/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export function ClientAdd() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ClientState, FormData>(createClient, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <div className="mb-5 flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Icon name="plus" className="size-4" />
          Add client
        </Button>
      </div>
    );
  }

  return (
    <Card className="mb-5 p-5">
      <h3 className="mb-4 text-sm font-semibold text-content">New client</h3>
      <form ref={ref} action={formAction} className="space-y-4">
        {state.error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {state.error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name" htmlFor="c-name" required>
            <Input id="c-name" name="name" placeholder="Jane Doe" required />
          </Field>
          <Field label="Company" htmlFor="c-company">
            <Input id="c-company" name="companyName" placeholder="Acme Inc." />
          </Field>
          <Field label="Email" htmlFor="c-email">
            <Input id="c-email" name="email" type="email" placeholder="jane@acme.com" />
          </Field>
          <Field label="Phone" htmlFor="c-phone">
            <Input id="c-phone" name="phone" placeholder="+91 …" />
          </Field>
        </div>
        <Field label="Address" htmlFor="c-address">
          <Textarea id="c-address" name="address" placeholder="Optional" />
        </Field>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create client"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
