"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePortalBadge } from "@/lib/org/actions";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PortalBadge } from "@/components/portal/portal-badge";

export type PortalBadgeInfo = {
  portalBadgeText: string | null;
  portalBadgeName: string | null;
  portalBadgeUrl: string | null;
  logoUrl: string | null;
};

/**
 * The "Made by …" chip shown in the corner of the client portal.
 *
 * The live preview uses the real {@link PortalBadge}, not a mock-up, so what an
 * admin approves here is exactly what their clients get.
 */
export function PortalBadgeForm({ company }: { company: PortalBadgeInfo }) {
  const router = useRouter();
  const [text, setText] = useState(company.portalBadgeText ?? "");
  const [name, setName] = useState(company.portalBadgeName ?? "");
  const [url, setUrl] = useState(company.portalBadgeUrl ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updatePortalBadge({ text, name, url });
      if (res.error) setErr(res.error);
      else {
        setMsg(name.trim() ? "Portal badge saved." : "Portal badge removed.");
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-content">Client portal badge</h3>
      <p className="mt-0.5 text-sm text-muted">
        A small credit in the corner of the client portal. Your clients see it; your team never does.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Lead-in" htmlFor="pb-text" hint="The quiet bit, e.g. “Made by”">
          <Input id="pb-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Made by" maxLength={40} />
        </Field>
        <Field label="Name" htmlFor="pb-name" hint="Clear this to hide the badge entirely">
          <Input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="EPIC" maxLength={40} />
        </Field>
        <Field label="Link" htmlFor="pb-url" hint="Optional — where the badge goes when clicked" className="sm:col-span-2">
          <Input id="pb-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" maxLength={300} />
        </Field>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Preview</p>
        {name.trim() ? (
          <PortalBadge text={text} name={name} url={null} logoUrl={company.logoUrl} preview />
        ) : (
          <p className="text-sm text-muted">No badge — the portal corner stays empty.</p>
        )}
      </div>

      {err && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{err}</p>}
      {msg && <p className="mt-4 text-sm text-accent-strong">{msg}</p>}

      <div className="mt-5">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save badge"}
        </Button>
      </div>
    </Card>
  );
}
