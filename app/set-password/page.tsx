import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set password · Operix" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let valid = false;
  let email = "";
  if (token) {
    const user = await prisma.user.findFirst({
      where: { setupToken: token },
      select: { email: true, setupTokenExpiresAt: true },
    });
    if (user && user.setupTokenExpiresAt && user.setupTokenExpiresAt > new Date()) {
      valid = true;
      email = user.email;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="gradient-brand flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white">
            Op
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-content">Operix</span>
        </div>

        {valid ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-content">Set your password</h1>
            <p className="mb-6 mt-1.5 text-sm text-muted">
              Welcome! Choose a password for <span className="font-medium text-content">{email}</span>.
            </p>
            <SetPasswordForm token={token!} />
          </>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
            <h1 className="text-lg font-semibold text-content">Link invalid or expired</h1>
            <p className="mt-2 text-sm text-muted">
              This setup link is no longer valid. Ask an administrator to re-invite you.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-medium text-accent-strong hover:underline">
              Go to sign in →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
