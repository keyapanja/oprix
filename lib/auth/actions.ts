"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { appUrl, sendPasswordResetEmail } from "@/lib/email";

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
    where: { email: { equals: email, mode: "insensitive" }, isActive: true },
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

  // Return the user to where they were headed (e.g. the extension connect page)
  // when it's a safe internal path; otherwise role-home.
  const next = String(formData.get("next") ?? "");
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") && !next.includes("://") ? next : null;
  if (safeNext) redirect(safeNext);

  // Clients land in their portal; everyone else in the internal app.
  redirect(user.role === "CLIENT" ? "/portal" : "/dashboard");
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
    return { error: "This link is invalid or has expired. Request a new one." };
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

// ---- Forgot password (self-service reset) ---------------------------------
const ForgotSchema = z.object({ email: z.string().email("Enter a valid email") });
export type ForgotState = { ok?: boolean; error?: string };

/**
 * Starts a self-service reset: issues a short-lived setup token (the same
 * mechanism invites use) and emails a reset link to /set-password. Always
 * reports success so the form can't be used to discover which emails exist.
 */
export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = ForgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  const email = parsed.data.email.trim();

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, isActive: true },
    select: {
      id: true,
      company: { select: { name: true } },
      employee: { select: { fullName: true } },
      client: { select: { name: true } },
    },
  });

  if (user) {
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.user.update({
      where: { id: user.id },
      data: { setupToken: token, setupTokenExpiresAt: expires },
    });
    try {
      await sendPasswordResetEmail({
        to: email,
        name: user.employee?.fullName ?? user.client?.name ?? email.split("@")[0],
        companyName: user.company?.name ?? "Operix",
        link: appUrl(`/set-password?token=${token}&reset=1`),
      });
    } catch (e) {
      console.error("[reset] email failed:", e);
    }
  }

  // Same response whether or not the account exists (no enumeration).
  return { ok: true };
}

// ---- Change password (signed-in self-service) -----------------------------
const ChangePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

export type ChangePasswordState = { ok?: boolean; error?: string };

/**
 * Lets any signed-in user — including Super Admins — change their own password
 * from their profile. The current password is required to authorize the change,
 * so an unattended session can't be used to take over the account.
 */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const parsed = ChangePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { current, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) return { error: "Account not found." };

  if (!(await verifyPassword(current, user.passwordHash))) {
    return { error: "Your current password is incorrect." };
  }
  if (await verifyPassword(password, user.passwordHash)) {
    return { error: "Choose a password different from your current one." };
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(password) },
  });

  return { ok: true };
}
