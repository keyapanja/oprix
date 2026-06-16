"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const initial: ForgotState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initial);

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-lg font-semibold text-content">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          If that email has an account, we've sent a link to reset your password. It expires in 1 hour.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-accent-strong hover:underline">
          Back to sign in →
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-content">Forgot your password?</h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">Enter your email and we'll send you a reset link.</p>
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {state.error}
          </div>
        )}
        <Field label="Email" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-accent-strong hover:underline">Back to sign in</Link>
        </p>
      </form>
    </>
  );
}
