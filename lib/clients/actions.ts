"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { sendInviteEmail, appUrl } from "@/lib/email";

export type ClientState = { error?: string; ok?: boolean };

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  companyName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function createClient(
  _prev: ClientState,
  formData: FormData,
): Promise<ClientState> {
  const session = await requireCapability("client:manage");
  const parsed = ClientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  await prisma.client.create({
    data: {
      companyId: session.companyId,
      name: d.name,
      companyName: d.companyName || null,
      email: d.email || null,
      phone: d.phone || null,
      address: d.address || null,
    },
  });
  revalidatePath("/clients");
  return { ok: true };
}

const ClientUpdateSchema = ClientSchema.extend({ id: z.string().min(1, "Missing id") });

export async function updateClient(
  _prev: ClientState,
  formData: FormData,
): Promise<ClientState> {
  const session = await requireCapability("client:manage");
  const parsed = ClientUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...d } = parsed.data;
  const res = await prisma.client.updateMany({
    where: { id, companyId: session.companyId, deletedAt: null },
    data: {
      name: d.name,
      companyName: d.companyName || null,
      email: d.email || null,
      phone: d.phone || null,
      address: d.address || null,
    },
  });
  if (res.count === 0) return { error: "Client not found" };
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function softDeleteClient(id: string): Promise<ClientState> {
  const session = await requireCapability("client:manage");
  await prisma.client.updateMany({
    where: { id, companyId: session.companyId },
    data: { deletedAt: new Date(), deletedById: session.userId },
  });
  revalidatePath("/clients");
  return { ok: true };
}

const ContactSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export async function addClientContact(
  _prev: ClientState,
  formData: FormData,
): Promise<ClientState> {
  const session = await requireCapability("client:manage");
  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Tenant safety: the client must belong to this company.
  const client = await prisma.client.findFirst({
    where: { id: d.clientId, companyId: session.companyId },
    select: { id: true },
  });
  if (!client) return { error: "Client not found" };

  await prisma.clientContact.create({
    data: {
      clientId: d.clientId,
      name: d.name,
      email: d.email || null,
      phone: d.phone || null,
    },
  });
  revalidatePath(`/clients/${d.clientId}`);
  return { ok: true };
}

// ---- Client portal invite --------------------------------------------------

export type InviteState = { ok?: boolean; delivered?: boolean; error?: string };

/**
 * Provision (or re-issue) a CLIENT-role portal login under a client and email
 * the set-password link. A client can have several logins that all share the
 * same clientId — this covers both the *first* login and any additional team
 * members. It's the admin-side twin of the portal's own `inviteTeamMember`
 * (which the client's primary contact uses from inside the portal).
 */
export async function inviteClientTeamMember(clientId: string, email: string): Promise<InviteState> {
  const session = await requireCapability("client:manage");

  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId: session.companyId, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { error: "Client not found" };

  const inviteEmail = (email || "").trim().toLowerCase();
  if (!z.string().email().safeParse(inviteEmail).success) return { error: "Enter a valid email address." };

  // Reuse the row only if this email already belongs to *this* client (a pending
  // or revoked login → resend/re-activate). Any other account owning it blocks.
  const existing = await prisma.user.findFirst({
    where: { companyId: session.companyId, email: inviteEmail },
    select: { id: true, clientId: true, passwordHash: true, isActive: true },
  });
  if (existing && existing.clientId !== client.id) {
    return { error: "That email is already used by another account in this workspace." };
  }
  if (existing && existing.passwordHash && existing.isActive) {
    return { error: "That person already has portal access." };
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { email: inviteEmail, setupToken: token, setupTokenExpiresAt: expires, isActive: true },
    });
  } else {
    await prisma.user.create({
      data: {
        companyId: session.companyId,
        email: inviteEmail,
        role: Role.CLIENT,
        clientId: client.id,
        passwordHash: null,
        setupToken: token,
        setupTokenExpiresAt: expires,
      },
    });
  }

  // Seed the client's own email from the first login when none is on file.
  if (!client.email) {
    await prisma.client.update({ where: { id: client.id }, data: { email: inviteEmail } });
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true },
  });

  let delivered = false;
  try {
    const res = await sendInviteEmail({
      to: inviteEmail,
      name: client.name,
      companyName: company?.name ?? "Oprix",
      link: appUrl(`/set-password?token=${token}`),
    });
    delivered = res.delivered;
  } catch (e) {
    console.error("[invite-client-team] email failed:", e);
  }

  revalidatePath(`/clients/${client.id}`);
  return { ok: true, delivered };
}

/**
 * Revoke a client portal login. The client's primary (earliest) login is
 * protected here — removing that one means revoking the whole client, which is
 * a different, more deliberate action.
 */
export async function removeClientTeamMember(clientId: string, userId: string): Promise<ClientState> {
  const session = await requireCapability("client:manage");

  const logins = await prisma.user.findMany({
    where: { clientId, companyId: session.companyId, role: "CLIENT", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const primaryId = logins[0]?.id ?? null;
  if (!logins.some((u) => u.id === userId)) return { error: "Team member not found." };
  if (userId === primaryId) return { error: "The primary contact can't be removed here." };

  await prisma.user.updateMany({
    where: { id: userId, clientId, companyId: session.companyId, role: "CLIENT" },
    data: { isActive: false, setupToken: null },
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
