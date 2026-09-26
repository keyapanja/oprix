"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { clientIp, rateLimited } from "@/lib/auth/rate-limit";
import { hashToken, LINK_DEAD, MAGIC_LINK_TTL_MINUTES } from "@/lib/auth/magic-link";
import { appUrl, sendMagicLinkEmail, sendPasswordResetEmail } from "@/lib/email";
import { safeInternalPath } from "@/lib/url";

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
  const safeNext = safeInternalPath(String(formData.get("next") ?? ""));
  if (safeNext) redirect(safeNext);

  // Clients land in their portal; everyone else in the internal app.
  redirect(user.role === "CLIENT" ? "/portal" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---- Magic link (passwordless sign-in) ------------------------------------

const MAGIC_LINK_WINDOW_MS = 15 * 60 * 1000;
/** Ceilings so the form can't be turned into a mail-bomb (or an SMTP bill). */
const MAGIC_LINK_PER_EMAIL = 3;
const MAGIC_LINK_PER_IP = 10;

const MagicLinkSchema = z.object({ email: z.string().email("Enter a valid email") });
export type MagicLinkState = { ok?: boolean; error?: string };

/**
 * Emails a one-time sign-in link. Always reports success so the form can't be
 * used to discover which addresses have accounts — the rate-limit message is
 * the one exception, and it's keyed on the submitted address whether or not it
 * exists, so it reveals nothing either.
 *
 * Works for invited users who never set a password: holding the inbox is the
 * same proof the invite link asks for.
 */
export async function requestMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = MagicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  const email = parsed.data.email.trim();
  const next = safeInternalPath(String(formData.get("next") ?? ""));

  const ip = clientIp(await headers());
  const tooMany =
    rateLimited(`magic:ip:${ip}`, MAGIC_LINK_PER_IP, MAGIC_LINK_WINDOW_MS) ||
    rateLimited(`magic:email:${email.toLowerCase()}`, MAGIC_LINK_PER_EMAIL, MAGIC_LINK_WINDOW_MS);
  if (tooMany) {
    return { error: "Too many sign-in links requested. Try again in a few minutes." };
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, isActive: true },
      select: {
        id: true,
        email: true,
        company: { select: { name: true } },
        employee: { select: { fullName: true } },
        client: { select: { name: true } },
      },
    });

    if (user) {
      const token = randomBytes(32).toString("hex");
      // Issuing a new link retires the previous one — only the latest works.
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginTokenHash: hashToken(token),
          loginTokenExpiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000),
        },
      });
      const qs = new URLSearchParams({ token });
      if (next) qs.set("next", next);
      try {
        await sendMagicLinkEmail({
          // The stored address, not the typed one — same account, right casing.
          to: user.email,
          name: user.employee?.fullName ?? user.client?.name ?? user.email.split("@")[0],
          companyName: user.company?.name ?? "Oprix",
          link: appUrl(`/login/magic?${qs.toString()}`),
          minutes: MAGIC_LINK_TTL_MINUTES,
        });
      } catch (e) {
        console.error("[magic-link] email failed:", e);
      }
    }
  } catch (e) {
    // The sign-in page must survive a broken database or an unapplied schema.
    // Letting this throw replaces the whole login screen with Next's error page,
    // taking password sign-in down with it — for a feature that's optional.
    //
    // This does mean that *while the backend is broken* the message appears only
    // for addresses that exist, which is a weak enumeration signal. Accepted:
    // it needs the app to already be failing, and the alternative is people
    // staring at "check your email" for a mail that is never coming.
    console.error("[magic-link] request failed:", e);
    return {
      error: "We couldn't send a sign-in link just now. Sign in with your password, or try again in a moment.",
    };
  }

  // Same response either way (no enumeration).
  return { ok: true };
}

/**
 * Spends a sign-in link and starts the session. Only reachable by POST, so the
 * link survives the previewers and security scanners that GET every URL in an
 * inbox before the person ever clicks it.
 */
export async function consumeMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: LINK_DEAD };

  // Where to land once the session exists. Computed inside the try so the
  // redirect itself stays outside it — redirect() works by throwing, and a
  // catch would swallow it.
  let destination: string;
  try {
    const user = await prisma.user.findFirst({
      where: { loginTokenHash: hashToken(token), isActive: true },
      select: {
        id: true,
        companyId: true,
        role: true,
        email: true,
        employeeId: true,
        clientId: true,
        loginTokenExpiresAt: true,
      },
    });
    if (!user?.loginTokenExpiresAt || user.loginTokenExpiresAt < new Date()) {
      return { error: LINK_DEAD };
    }

    // Burn it first, guarded on it still being present, so a double submit or a
    // forwarded link can't turn one token into two sessions.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, loginTokenHash: hashToken(token) },
      data: { loginTokenHash: null, loginTokenExpiresAt: null, lastLoginAt: new Date() },
    });
    if (claimed.count !== 1) return { error: LINK_DEAD };

    await createSession({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
      employeeId: user.employeeId,
      clientId: user.clientId,
    });

    destination =
      safeInternalPath(String(formData.get("next") ?? "")) ??
      (user.role === "CLIENT" ? "/portal" : "/dashboard");
  } catch (e) {
    // Never let a backend problem render as a crashed page on the way in. Said
    // separately from LINK_DEAD so nobody burns a second link chasing a fault
    // that was never about the link.
    console.error("[magic-link] sign-in failed:", e);
    return { error: "Something went wrong signing you in. Try the link again in a moment." };
  }

  redirect(destination);
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
        companyName: user.company?.name ?? "Oprix",
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
