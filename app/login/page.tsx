import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Sign in · Operix" };

const FEATURES = [
  "Employees, attendance & payroll in one place",
  "Projects, tasks & client portals",
  "Real-time reporting & analytics",
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const { set } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand hero */}
      <div className="gradient-mesh relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        {/* Floating blobs */}
        <div className="animate-blob pointer-events-none absolute -left-16 top-10 size-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="animate-blob animation-delay-2 pointer-events-none absolute right-0 top-1/3 size-72 rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="animate-blob animation-delay-4 pointer-events-none absolute bottom-0 left-1/4 size-72 rounded-full bg-violet-500/25 blur-3xl" />

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-sm font-bold backdrop-blur">
            Op
          </span>
          <span className="text-2xl font-bold tracking-tight">Operix</span>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            One system for your
            <br />
            entire operation.
          </h1>
          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-brand-100">
                <span className="flex size-6 items-center justify-center rounded-full bg-white/15">
                  <Icon name="check" className="size-3.5 text-white" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-sm text-brand-200">
          © {new Date().getFullYear()} Operix · Business Operations Platform
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8">
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <span className="gradient-brand flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white">
                Op
              </span>
              <span className="font-display text-xl font-bold tracking-tight text-content">Operix</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-content">
              Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Sign in to your account to continue.
            </p>
          </div>
          {set && (
            <div className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25">
              Password set! You can sign in now.
            </div>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
