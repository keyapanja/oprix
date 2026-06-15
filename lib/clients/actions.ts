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
    data: { deletedAt: new Date() },
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
 * Provision (or re-issue) a CLIENT-role login for a client and email the
 * set-password link. Mirrors the employee invite flow. The invite goes to the
 * client's email; an override can be supplied (and is saved) when none is set.
 */
export async function inviteClient(clientId: string, email?: string): Promise<InviteState> {
  const session = await requireCapability("client:manage");

  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId: session.companyId, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { error: "Client not found" };

  const inviteEmail = (email?.trim() || client.email || "").trim().toLowerCase();
  if (!z.string().email().safeParse(inviteEmail).success) {
    return { error: "Add an email address to invite this client." };
  }

  // Already has a working login?
  const existing = await prisma.user.findFirst({
    where: { companyId: session.companyId, clientId: client.id },
    select: { id: true, passwordHash: true },
  });
  if (existing?.passwordHash) return { error: "This client already has portal access." };

  // Email must not collide with a different account in the company.
  const clash = await prisma.user.findFirst({
    where: { companyId: session.companyId, email: inviteEmail, NOT: { clientId: client.id } },
    select: { id: true },
  });
  if (clash) return { error: "Another account already uses that email." };

  // Save the email onto the client if it didn't have one.
  if (!client.email) {
    await prisma.client.update({ where: { id: client.id }, data: { email: inviteEmail } });
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true },
  });

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

  let delivered = false;
  try {
    const res = await sendInviteEmail({
      to: inviteEmail,
      name: client.name,
      companyName: company?.name ?? "Operix",
      link: appUrl(`/set-password?token=${token}`),
    });
    delivered = res.delivered;
  } catch (e) {
    console.error("[invite-client] email failed:", e);
  }

  revalidatePath(`/clients/${client.id}`);
  return { ok: true, delivered };
}
