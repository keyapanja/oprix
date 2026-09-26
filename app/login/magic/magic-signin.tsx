"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { consumeMagicLink, type MagicLinkState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

const initial: MagicLinkState = {};

/**
 * Spends the sign-in link. The form submits itself on mount, so for a real
 * person this is still one click from the email — but the token is only ever
 * spent by a POST, which the link previewers and security scanners that GET
 * every URL in an inbox never make. The button is the no-JS fallback.
 */
export function MagicSignin({
  token,
  next,
  email,
}: {
  token: string;
  next?: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(consumeMagicLink, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    // Once only: React 19 Strict Mode runs effects twice in dev, and the second
    // pass would land on an already-spent token.
    if (submitted.current) return;
    submitted.current = true;
    formRef.current?.requestSubmit();
  }, []);

  if (state.error) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-lg font-semibold text-content">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-muted">{state.error}</p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-accent-strong hover:underline"
        >
          Go to sign in →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
      <h1 className="text-lg font-semibold text-content">Signing you in…</h1>
      <p className="mt-2 text-sm text-muted">
        Continuing as <span className="font-medium text-content">{email}</span>.
      </p>
      <form ref={formRef} action={formAction} className="mt-4">
        <input type="hidden" name="token" value={token} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Continue to Oprix"}
        </Button>
      </form>
    </div>
  );
}
