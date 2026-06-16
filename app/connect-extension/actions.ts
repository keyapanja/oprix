"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { mintExtensionToken } from "@/lib/ext/auth";
import { isExtensionRedirect } from "@/lib/ext/url";

/**
 * Authorize the extension: mint a token for the logged-in user and redirect back
 * to the extension's chrome.identity callback with the raw token in the URL
 * fragment (captured by launchWebAuthFlow, never sent to a server).
 */
export async function authorizeExtension(formData: FormData): Promise<void> {
  const session = await requireSession();
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const state = String(formData.get("state") ?? "");
  const label = String(formData.get("label") ?? "Browser extension");
  if (!isExtensionRedirect(redirectUri)) throw new Error("Invalid redirect target");

  const { raw } = await mintExtensionToken(
    { id: session.userId, companyId: session.companyId },
    label,
  );
  const sep = redirectUri.includes("#") ? "&" : "#";
  redirect(`${redirectUri}${sep}token=${encodeURIComponent(raw)}&state=${encodeURIComponent(state)}`);
}
