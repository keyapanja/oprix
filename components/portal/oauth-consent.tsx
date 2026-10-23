"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { approveOAuthRequest, denyOAuthRequest } from "@/lib/api/actions";
import type { AuthorizeRequest } from "@/lib/api/oauth";
import { ProjectPicker } from "@/components/portal/api-connect";

export function OAuthConsent({
  request,
  appName,
  returnHost,
  accountName,
  wantsWrite,
  projects,
  blocked,
}: {
  request: Partial<AuthorizeRequest>;
  appName: string;
  returnHost: string;
  accountName: string;
  wantsWrite: boolean;
  projects: { id: string; name: string }[];
  blocked: string | null;
}) {
  const [canWrite, setCanWrite] = useState(wantsWrite);
  const [some, setSome] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function go(res: { redirect?: string; error?: string }) {
    if (res.redirect) window.location.assign(res.redirect);
    else toast.error(res.error ?? "Something went wrong.");
  }

  return (
    <Card className="mx-auto max-w-lg p-6">
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
        <Icon name="key" className="size-5" />
      </span>
      <h1 className="text-lg font-semibold text-content">
        Connect <span className="text-accent-strong">{appName}</span> to {accountName || "your account"}?
      </h1>
      <p className="mt-1 text-sm text-muted">
        It will see what you see in this portal, nothing more. Saved logins are never shared. It sends you back to{" "}
        <span className="font-medium text-content">{returnHost}</span>. Only continue if you started this from your AI app.
      </p>

      {blocked ? (
        <p className="mt-5 rounded-lg bg-canvas p-3 text-sm text-muted">{blocked}</p>
      ) : (
        <div className="mt-5 space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-content">What it may do</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { v: true, label: "Read and change", hint: "raise, edit, comment, approve", off: !wantsWrite },
                { v: false, label: "Read only", hint: "look, never change", off: false },
              ].map((o) => (
                <label
                  key={o.label}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm ring-1 ring-inset",
                    o.off ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    canWrite === o.v ? "bg-accent-soft text-content ring-brand-500/40" : "text-muted ring-line hover:bg-canvas",
                  )}
                >
                  <input type="radio" className="sr-only" disabled={o.off} checked={canWrite === o.v} onChange={() => setCanWrite(o.v)} />
                  <span className="font-medium">{o.label}</span> <span className="text-xs text-faint">· {o.hint}</span>
                </label>
              ))}
            </div>
            {!wantsWrite && <p className="mt-1 text-xs text-faint">The app only asked to read.</p>}
          </fieldset>
          <ProjectPicker projects={projects} some={some} setSome={setSome} picked={picked} setPicked={setPicked} />
          <p className="text-xs text-faint">The connection lasts 90 days. You can revoke it any time under Connect Claude.</p>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => go(await denyOAuthRequest(request)))}>
          {blocked ? "Go back" : "Cancel"}
        </Button>
        {!blocked && (
          <Button
            disabled={pending || (some && picked.length === 0)}
            onClick={() => start(async () => go(await approveOAuthRequest(request, { canWrite, projectIds: some ? picked : [] })))}
          >
            {pending ? "Connecting…" : "Approve"}
          </Button>
        )}
      </div>
    </Card>
  );
}
