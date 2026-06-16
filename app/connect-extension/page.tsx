import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { isExtensionRedirect } from "@/lib/ext/url";
import { authorizeExtension } from "./actions";

export const metadata: Metadata = { title: "Connect extension · Operix" };

// Web-authorize step of the extension connect flow. The proxy already requires a
// logged-in staff session to reach this page, so by here the user is who the
// token will belong to.
export default async function ConnectExtensionPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string; state?: string; label?: string }>;
}) {
  const session = await requirePage("self:service");
  const sp = await searchParams;
  const redirectUri = sp.redirect_uri ?? "";
  const state = sp.state ?? "";
  const label = (sp.label ?? "Browser extension").slice(0, 80);
  const valid = isExtensionRedirect(redirectUri);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card">
        <div className="mb-1 text-sm font-semibold text-brand-600">Operix Companion</div>
        <h1 className="text-xl font-semibold text-content">Connect your browser extension</h1>

        {valid ? (
          <>
            <p className="mt-3 text-sm text-muted">
              This will let the extension show your running tasks and control your timers as{" "}
              <span className="font-medium text-content">{session.email}</span>. You can disconnect
              it anytime from <span className="font-medium text-content">Profile → Connected devices</span>.
            </p>
            <form action={authorizeExtension} className="mt-6">
              <input type="hidden" name="redirect_uri" value={redirectUri} />
              <input type="hidden" name="state" value={state} />
              <input type="hidden" name="label" value={label} />
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Authorize {label}
              </button>
            </form>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Open this page from the extension&rsquo;s <span className="font-medium text-content">Connect</span>{" "}
            button — it didn&rsquo;t provide a valid return address, so there&rsquo;s nothing to authorize here.
          </p>
        )}
      </div>
    </main>
  );
}
