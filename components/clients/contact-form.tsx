"use client";

import { useActionState, useEffect, useRef } from "react";
import { addClientContact, type ClientState } from "@/lib/clients/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ContactForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState<ClientState, FormData>(
    addClientContact,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="min-w-36 flex-1">
        <label className="mb-1 block text-xs font-medium text-muted">Name</label>
        <Input name="name" placeholder="Contact name" required />
      </div>
      <div className="min-w-36 flex-1">
        <label className="mb-1 block text-xs font-medium text-muted">Email</label>
        <Input name="email" type="email" placeholder="name@company.com" />
      </div>
      <div className="min-w-32 flex-1">
        <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
        <Input name="phone" placeholder="+91 …" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
