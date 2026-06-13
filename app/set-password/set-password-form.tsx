"use client";

import { useActionState } from "react";
import { setPasswordAction, type SetPasswordState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(
    setPasswordAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}
      <Field label="New password" htmlFor="password" required>
        <Input id="password" name="password" type="password" placeholder="••••••••" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" required>
        <Input id="confirm" name="confirm" type="password" placeholder="••••••••" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set password & continue"}
      </Button>
    </form>
  );
}
