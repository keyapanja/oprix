"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/guard";
import { primaryContactId } from "@/lib/api/auth";
import { notifyNewConnection } from "@/lib/api/notify";
import { checkAuthorize, issueCode, redirectWith, revokeConnection, type AuthorizeRequest } from "@/lib/api/oauth";
import { CONNECTION_DAYS, KEY_PREFIX, displayPrefix, mint, sha256 } from "@/lib/api/tokens";

// Every export is a callable endpoint: each re-checks who is asking. Keys and
// app approvals are the primary contact's alone, only while the team has
// switched API access on for their account, and never from an API call.

export type ApiActionState = { ok?: boolean; error?: string };

type Owner = { userId: string; clientId: string; companyId: string };

/** The signed-in browser user, if they're a client's primary contact with API access on. */
async function primaryOwner(): Promise<Owner | { error: string }> {
  const s = await getSession();
  if (!s || s.via === "api" || s.role !== "CLIENT" || !s.clientId) return { error: "Not authorized." };
  const client = await prisma.client.findFirst({
    where: { id: s.clientId, companyId: s.companyId, deletedAt: null },
    select: { apiEnabled: true },
  });
  if (!client?.apiEnabled) return { error: "API access isn't switched on for your account." };
  if ((await primaryContactId(s.clientId, s.companyId)) !== s.userId) {
    return { error: "Only your account's primary contact can do this." };
  }
  return { userId: s.userId, clientId: s.clientId, companyId: s.companyId };
}

/** Keep only the client's own, live projects; [] = all of them. */
async function ownProjects(owner: Owner, ids: string[]): Promise<string[] | { error: string }> {
  if (!ids.length) return [];
  const found = await prisma.project.findMany({
    where: { id: { in: ids }, clientId: owner.clientId, companyId: owner.companyId, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== new Set(ids).size) return { error: "Choose from your own projects." };
  return found.map((p) => p.id);
}

const KeyZ = z.object({
  name: z.string().trim().min(1, "Give the key a name.").max(60),
  canWrite: z.boolean(),
  projectIds: z.array(z.string().min(1).max(64)).max(200),
});

/** Create an API key. The key is returned once and never stored. */
export async function createApiKey(input: z.input<typeof KeyZ>): Promise<ApiActionState & { key?: string }> {
  const owner = await primaryOwner();
  if ("error" in owner) return owner;
  const parsed = KeyZ.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const projects = await ownProjects(owner, parsed.data.projectIds);
  if ("error" in projects) return projects;

  const key = mint(KEY_PREFIX);
  const c = await prisma.apiConnection.create({
    data: {
      companyId: owner.companyId,
      clientId: owner.clientId,
      userId: owner.userId,
      kind: "KEY",
      name: parsed.data.name,
      keyPrefix: displayPrefix(key),
      keyHash: sha256(key),
      canWrite: parsed.data.canWrite,
      projectIds: projects,
      expiresAt: new Date(Date.now() + CONNECTION_DAYS * 86_400_000),
    },
    select: { id: true },
  });
  await notifyNewConnection(c.id);
  revalidatePath("/portal/connect");
  return { ok: true, key };
}

/** Revoke one of the account's keys or connected apps — at once, for good. */
export async function revokeApiConnection(connectionId: string): Promise<ApiActionState> {
  const s = await getSession();
  if (!s || s.via === "api" || s.role !== "CLIENT" || !s.clientId) return { error: "Not authorized." };
  if ((await primaryContactId(s.clientId, s.companyId)) !== s.userId) {
    return { error: "Only your account's primary contact can do this." };
  }
  const c = await prisma.apiConnection.findFirst({
    where: { id: String(connectionId), clientId: s.clientId, companyId: s.companyId },
    select: { id: true },
  });
  if (!c) return { error: "Not found." };
  await revokeConnection(c.id);
  revalidatePath("/portal/connect");
  return { ok: true };
}

// ---- The consent screen ---------------------------------------------------------

const ChoiceZ = z.object({ canWrite: z.boolean(), projectIds: z.array(z.string().min(1).max(64)).max(200) });

/** Approve an app. Everything is re-validated here — the page's checks are for display only. */
export async function approveOAuthRequest(
  request: Partial<AuthorizeRequest>,
  choice: z.input<typeof ChoiceZ>,
): Promise<{ redirect?: string; error?: string }> {
  const owner = await primaryOwner();
  if ("error" in owner) return owner;
  const parsed = ChoiceZ.safeParse(choice);
  if (!parsed.success) return { error: "Check your choices." };
  const checked = await checkAuthorize(request);
  if ("fatal" in checked) return { error: checked.fatal };
  if ("redirect" in checked) return { redirect: checked.redirect };
  const projects = await ownProjects(owner, parsed.data.projectIds);
  if ("error" in projects) return projects;

  const code = await issueCode({
    appId: checked.ok.app.id,
    userId: owner.userId,
    redirectUri: checked.ok.redirectUri,
    codeChallenge: checked.ok.codeChallenge,
    // An app that only asked to read never gets more, whatever the form says.
    canWrite: parsed.data.canWrite && checked.ok.wantsWrite,
    projectIds: projects,
  });
  return { redirect: redirectWith(checked.ok.redirectUri, { code, state: checked.ok.state }) };
}

export async function denyOAuthRequest(request: Partial<AuthorizeRequest>): Promise<{ redirect?: string; error?: string }> {
  const s = await getSession();
  if (!s || s.via === "api") return { error: "Not authorized." };
  const checked = await checkAuthorize(request);
  if ("fatal" in checked) return { error: checked.fatal };
  if ("redirect" in checked) return { redirect: checked.redirect };
  return {
    redirect: redirectWith(checked.ok.redirectUri, {
      error: "access_denied",
      error_description: "The request was declined.",
      state: checked.ok.state,
    }),
  };
}

// ---- The team's switch ----------------------------------------------------------

/** Switch a client's API access on or off. Off revokes every key and app. */
export async function setClientApiAccess(clientId: string, enabled: boolean): Promise<ApiActionState> {
  const session = await requireCapability("client:manage");
  const client = await prisma.client.findFirst({
    where: { id: String(clientId), companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!client) return { error: "Client not found." };
  await prisma.client.update({ where: { id: client.id }, data: { apiEnabled: !!enabled } });
  if (!enabled) {
    const live = await prisma.apiConnection.findMany({ where: { clientId: client.id, revokedAt: null }, select: { id: true } });
    for (const c of live) await revokeConnection(c.id);
  }
  revalidatePath(`/clients/${client.id}`);
  return { ok: true };
}

export async function adminRevokeConnection(connectionId: string): Promise<ApiActionState> {
  const session = await requireCapability("client:manage");
  const c = await prisma.apiConnection.findFirst({
    where: { id: String(connectionId), companyId: session.companyId },
    select: { id: true, clientId: true },
  });
  if (!c) return { error: "Not found." };
  await revokeConnection(c.id);
  revalidatePath(`/clients/${c.clientId}`);
  return { ok: true };
}
