"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateClient, type ClientState } from "@/lib/clients/actions";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export type ClientRow = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

function ClientForm({ client, onDone, onCancel }: { client: ClientRow; onDone: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<ClientState, FormData>(updateClient, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}
      <input type="hidden" name="id" value={client.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client name" htmlFor="ec-name" required>
          <Input id="ec-name" name="name" defaultValue={client.name} required />
        </Field>
        <Field label="Company" htmlFor="ec-company">
          <Input id="ec-company" name="companyName" defaultValue={client.companyName ?? ""} />
        </Field>
        <Field label="Email" htmlFor="ec-email">
          <Input id="ec-email" name="email" type="email" defaultValue={client.email ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="ec-phone">
          <Input id="ec-phone" name="phone" defaultValue={client.phone ?? ""} />
        </Field>
      </div>
      <Field label="Address" htmlFor="ec-address">
        <Textarea id="ec-address" name="address" defaultValue={client.address ?? ""} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save client"}</Button>
      </div>
    </form>
  );
}

export function ClientEdit({ client }: { client: ClientRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-faint transition-colors hover:bg-canvas hover:text-content"
        aria-label={`Edit ${client.name}`}
        title="Edit"
      >
        <Icon name="pencil" className="size-4" />
      </button>
      {open && (
        <Modal title={`Edit ${client.name}`} onClose={() => setOpen(false)}>
          <ClientForm client={client} onDone={() => { setOpen(false); router.refresh(); }} onCancel={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
