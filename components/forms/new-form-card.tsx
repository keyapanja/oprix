"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createForm } from "@/lib/forms/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function NewFormCard() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  function create() {
    if (!title.trim()) {
      toast.error("Give the form a title.");
      return;
    }
    start(async () => {
      const res = await createForm(title.trim());
      if (res.error || !res.id) {
        toast.error(res.error ?? "Couldn't create the form.");
        return;
      }
      router.push(`/forms/${res.id}/edit`);
    });
  }

  return (
    <Card className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold text-content">New form</h1>
      <p className="mt-1 text-sm text-muted">Give it a name — you&apos;ll build the fields next.</p>
      <div className="mt-4 space-y-3">
        <Input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
          placeholder="e.g. Client feedback"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push("/forms")}>
            Cancel
          </Button>
          <Button onClick={create} disabled={pending}>
            {pending ? "Creating…" : "Create & build"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
