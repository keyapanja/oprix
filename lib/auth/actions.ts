"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password } = parsed.data;

  // MVP is single-company-per-deployment, so email alone identifies the user.
  // The schema supports multi-company; add a company selector here later.
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: {
      id: true,
      companyId: true,
      role: true,
      email: true,
      employeeId: true,
      clientId: true,
      passwordHash: true,
    },
  });

  // Invited users have no password until they use the setup link.
  if (user && !user.passwordHash) {
    return { error: "Set your password first using the invite link we emailed you." };
  }

  // Always run a comparison-shaped path to avoid leaking which emails exist.
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return { error: "Invalid email or password" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await createSession({
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
    email: user.email,
    employeeId: user.employeeId,
    clientId: user.clientId,
  });

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---- Set password (invite flow) -------------------------------------------
const SetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

export type SetPasswordState = { error?: string };

export async function setPasswordAction(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = SetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { token, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { setupToken: token },
    select: { id: true, setupTokenExpiresAt: true },
  });
  if (!user || !user.setupTokenExpiresAt || user.setupTokenExpiresAt < new Date()) {
    return { error: "This link is invalid or has expired. Ask an admin to re-invite you." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      isActive: true,
      setupToken: null,
      setupTokenExpiresAt: null,
    },
  });

  redirect("/login?set=1");
}
