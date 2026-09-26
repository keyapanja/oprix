"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  loginAction,
  requestMagicLink,
  type LoginState,
  type MagicLinkState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";

const initialLogin: LoginState = {};
const initialMagic: MagicLinkState = {};

function ErrorBox({ children }: { children: string }) {
  return (
    <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
      {children}
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialLogin);
  const [magic, magicAction, magicPending] = useActionState(requestMagicLink, initialMagic);
  const [mode, setMode] = useState<"password" | "magic">("password");
  // Shared so switching modes doesn't make anyone retype their address.
  const [email, setEmail] = useState("");

  const hidden = next ? <input type="hidden" name="next" value={next} /> : null;
  const emailField = (
    <Field label="Email" htmlFor="email" required>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
    </Field>
  );

  if (magic.ok) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-lg font-semibold text-content">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          If that email has an account, a sign-in link is on its way. It works once and expires in
          15 minutes.
        </p>
        <button
          type="button"
          onClick={() => setMode("password")}
          className="mt-4 text-sm font-medium text-accent-strong hover:underline"
        >
          Sign in with a password instead
        </button>
      </div>
    );
  }

  if (mode === "magic") {
    return (
      <form action={magicAction} className="space-y-4">
        {hidden}
        {magic.error && <ErrorBox>{magic.error}</ErrorBox>}
        <p className="text-sm text-muted">
          We&rsquo;ll email you a link that signs you in — no password needed.
        </p>
        {emailField}
        <Button type="submit" className="w-full" disabled={magicPending}>
          {magicPending ? "Sending…" : "Send sign-in link"}
        </Button>
        <p className="text-center text-sm text-muted">
          <button
            type="button"
            onClick={() => setMode("password")}
            className="font-medium text-accent-strong hover:underline"
          >
            Sign in with a password instead
          </button>
        </p>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {hidden}
      {state.error && <ErrorBox>{state.error}</ErrorBox>}

      {emailField}

      <Field label="Password" htmlFor="password" required>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-line-strong" />
        <span className="text-xs font-medium uppercase tracking-wider text-faint">or</span>
        <span className="h-px flex-1 bg-line-strong" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => setMode("magic")}
      >
        <Icon name="mail" className="size-4" />
        Email me a sign-in link
      </Button>

      <p className="text-center text-sm text-muted">
        <Link href="/forgot-password" className="font-medium text-accent-strong hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
