"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";

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
