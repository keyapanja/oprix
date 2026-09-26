import type { Metadata } from "next";
import Link from "next/link";
import { peekMagicLink } from "@/lib/auth/magic-link";
import { MagicSignin } from "./magic-signin";

export const metadata: Metadata = { title: "Signing in · Oprix" };

export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;
  // Validated but not spent — the POST inside <MagicSignin> is what burns it.
  const link = token ? await peekMagicLink(token) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="gradient-brand flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white">
            Op
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-content">Oprix</span>
        </div>

        {link ? (
          <MagicSignin token={token!} next={next} email={link.email} />
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
            <h1 className="text-lg font-semibold text-content">Link invalid or expired</h1>
            <p className="mt-2 text-sm text-muted">
              Sign-in links work once and expire quickly. Request a fresh one from the sign-in page.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-accent-strong hover:underline"
            >
              Go to sign in →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
