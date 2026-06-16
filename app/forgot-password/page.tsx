import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · Operix" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="gradient-brand flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white">
            Op
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-content">Operix</span>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
