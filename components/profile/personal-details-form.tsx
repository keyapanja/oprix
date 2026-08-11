"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyDetails } from "@/lib/profile/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";

type Contact = { name: string; relationship: string; phone: string };

export function PersonalDetailsForm({
  initial,
}: {
  initial: { phone: string; personalEmail: string; dateOfBirth: string; contacts: Contact[] };
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initial.phone);
  const [personalEmail, setPersonalEmail] = useState(initial.personalEmail);
  const [dob, setDob] = useState(initial.dateOfBirth);
  const [contacts, setContacts] = useState<Contact[]>(initial.contacts);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patchContact(i: number, patch: Partial<Contact>) {
    setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addContact() {
    setContacts((cs) => [...cs, { name: "", relationship: "", phone: "" }]);
  }
  function removeContact(i: number) {
    setContacts((cs) => cs.filter((_, idx) => idx !== i));
  }

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updateMyDetails({
        phone,
        personalEmail,
        dateOfBirth: dob,
        emergencyContacts: contacts.filter((c) => c.name.trim() || c.phone.trim()),
      });
      if (res.error) setErr(res.error);
      else {
        setMsg("Details saved.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="pd-phone">
          <Input id="pd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
        </Field>
        <Field label="Personal email" htmlFor="pd-email" hint="A secondary address, separate from your work email">
          <Input
            id="pd-email"
            type="email"
            value={personalEmail}
            onChange={(e) => setPersonalEmail(e.target.value)}
            placeholder="you@personal.com"
          />
        </Field>
        <Field label="Date of birth">
          <DatePicker value={dob} onChange={setDob} placeholder="Select date" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-content">Emergency contacts</p>
          <Button type="button" variant="secondary" size="sm" onClick={addContact}>
            <Icon name="plus" className="size-4" /> Add contact
          </Button>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted">No emergency contacts added yet.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <div className="min-w-40 flex-[2]">
                  <Input value={c.name} onChange={(e) => patchContact(i, { name: e.target.value })} placeholder="Name" />
                </div>
                <div className="min-w-32 flex-1">
                  <Input value={c.relationship} onChange={(e) => patchContact(i, { relationship: e.target.value })} placeholder="Relationship" />
                </div>
                <div className="min-w-32 flex-[2]">
                  <Input value={c.phone} onChange={(e) => patchContact(i, { phone: e.target.value })} placeholder="Phone" />
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(i)}
                  className="shrink-0 rounded-lg p-2 text-faint transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"
                  aria-label="Remove contact"
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        {msg && <span className="text-sm text-green-600 dark:text-green-400">{msg}</span>}
        {err && <span className="text-sm text-red-600 dark:text-red-400">{err}</span>}
      </div>
    </div>
  );
}
