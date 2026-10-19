import type { SessionUser } from "@/lib/auth/session";
import { loadVault } from "@/lib/vault/data";
import { CredentialsLibrary } from "@/components/vault/credentials-library";

/**
 * A project's credentials library, for whoever is looking: the client in the
 * portal, a team member with access, or a project manager (who can manage the
 * access list even when they aren't on it). Renders nothing for anyone else.
 */
export async function CredentialsSection({ session, projectId }: { session: SessionUser; projectId: string }) {
  const view = await loadVault(session, projectId);
  if (!view) return null;
  return <CredentialsLibrary view={view} />;
}
