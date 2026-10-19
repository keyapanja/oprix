"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { setVaultWindows } from "@/lib/vault/actions";

/** Admins: how long one code keeps a library open, and how long changes stay allowed. */
export function VaultSettings({ viewMinutes, editMinutes }: { viewMinutes: number; editMinutes: number }) {
  const router = useRouter();
  const [view, setView] = useState(String(viewMinutes));
  const [edit, setEdit] = useState(String(editMinutes));
  const [pending, start] = useTransition();
  const changed = view !== String(viewMinutes) || edit !== String(editMinutes);

  function save() {
    start(async () => {
      const res = await setVaultWindows({ viewMinutes: Number(view), editMinutes: Number(edit) });
      if (res.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't save.");
      }
    });
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-sm font-semibold text-content">Security</h2>
      <p className="mb-4 mt-1 text-xs text-muted">
        Applies to everyone, team and clients. A change applies to the next code someone enters.
      </p>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Stay unlocked for" htmlFor="vault-view" hint="Minutes, 5–240">
          <Input
            id="vault-view"
            type="number"
            min={5}
            max={240}
            value={view}
            onChange={(e) => setView(e.target.value)}
            className="w-28"
          />
        </Field>
        <Field label="Allow changes for" htmlFor="vault-edit" hint="Minutes, 1–60">
          <Input
            id="vault-edit"
            type="number"
            min={1}
            max={60}
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
            className="w-28"
          />
        </Field>
        <Button type="submit" disabled={pending || !changed} className="mb-6">
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Card>
  );
}
