"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { createApiKey, revokeApiConnection } from "@/lib/api/actions";
import type { ApiAccountView, ConnectionRow } from "@/lib/api/data";

function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 ring-1 ring-inset ring-line">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-content">{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast.success(`Copied the ${label}`);
          } catch {
            toast.error("Couldn't copy — select it and copy by hand.");
          }
        }}
        className="shrink-0 rounded p-1 text-faint hover:bg-surface hover:text-content"
      >
        <Icon name="copy" className="size-4" />
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5 text-sm text-muted">{children}</div>
    </li>
  );
}

export function ApiConnect({ view, isPrimary, mcpUrl }: { view: ApiAccountView; isPrimary: boolean; mcpUrl: string }) {
  const [newKey, setNewKey] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {!isPrimary && (
        <Card className="flex items-start gap-3 p-4 text-sm text-muted">
          <Icon name="lock" className="mt-0.5 size-4 shrink-0 text-faint" />
          <p>
            Only {view.primaryName ? <span className="font-medium text-content">{view.primaryName}</span> : "your primary contact"}{" "}
            can connect apps, create keys or revoke them. You can see what&apos;s connected below.
          </p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-content">In Claude (claude.ai or the Claude app)</h2>
        <ol className="mt-3 space-y-3">
          <Step n={1}>
            Open <span className="font-medium text-content">Customize → Connectors → Add custom connector</span> (on Team
            and Enterprise plans, an admin adds it under Organization settings).
          </Step>
          <Step n={2}>
            Name it <span className="font-medium text-content">Oprix</span> and paste this URL:
            <div className="mt-1.5">
              <CopyField value={mcpUrl} label="connector URL" />
            </div>
          </Step>
          <Step n={3}>
            Claude sends you here to sign in. {isPrimary ? "Approve it, choosing what it may do." : "Your primary contact approves it."}
          </Step>
        </ol>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-content">With a key (Claude Code, other AI tools)</h2>
        <p className="mt-1 text-sm text-muted">
          For tools that take a URL and a header instead of signing in. A key works for 90 days.
        </p>
        {isPrimary ? (
          newKey ? (
            <NewKey keyValue={newKey} mcpUrl={mcpUrl} onDone={() => setNewKey(null)} />
          ) : (
            <KeyForm projects={view.projects} onCreated={setNewKey} />
          )
        ) : null}
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-content">Connections</h2>
        </div>
        {view.connections.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nothing connected yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {view.connections.map((c) => (
              <ConnectionItem key={c.id} c={c} canRevoke={isPrimary} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-content">Recent activity</h2>
        </div>
        {view.activity.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No API activity yet.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {view.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-content">{a.what}</span>
                  <span className="text-faint"> · {a.connection}</span>
                  {!a.ok && <span className="text-red-600"> · failed{a.error ? `: ${a.error}` : ""}</span>}
                </span>
                <span className="shrink-0 text-xs text-faint">{a.at}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function KeyForm({ projects, onCreated }: { projects: { id: string; name: string }[]; onCreated: (key: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState(true);
  const [some, setSome] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function create() {
    start(async () => {
      const res = await createApiKey({ name, canWrite, projectIds: some ? picked : [] });
      if (res.key) {
        onCreated(res.key);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't create the key.");
      }
    });
  }

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <Field label="Name" htmlFor="key-name" hint="So you can tell your keys apart, e.g. “Claude Code on my laptop”.">
        <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-content">What it may do</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { v: true, label: "Read and change", hint: "raise, edit, comment, approve" },
            { v: false, label: "Read only", hint: "look, never change" },
          ].map((o) => (
            <label
              key={o.label}
              className={cn(
                "cursor-pointer rounded-xl px-3 py-2 text-sm ring-1 ring-inset",
                canWrite === o.v ? "bg-accent-soft text-content ring-brand-500/40" : "text-muted ring-line hover:bg-canvas",
              )}
            >
              <input type="radio" className="sr-only" checked={canWrite === o.v} onChange={() => setCanWrite(o.v)} />
              <span className="font-medium">{o.label}</span> <span className="text-xs text-faint">· {o.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <ProjectPicker projects={projects} some={some} setSome={setSome} picked={picked} setPicked={setPicked} />
      <Button type="submit" disabled={pending || !name.trim() || (some && picked.length === 0)}>
        <Icon name="key" className="size-4" />
        {pending ? "Creating…" : "Create key"}
      </Button>
    </form>
  );
}

export function ProjectPicker({
  projects,
  some,
  setSome,
  picked,
  setPicked,
}: {
  projects: { id: string; name: string }[];
  some: boolean;
  setSome: (v: boolean) => void;
  picked: string[];
  setPicked: (v: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-content">Projects</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={!some} onChange={() => setSome(false)} /> All my projects
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={some} onChange={() => setSome(true)} /> Only some
        </label>
      </div>
      {some && (
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-canvas p-2 ring-1 ring-inset ring-line">
          {projects.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface">
              <input
                type="checkbox"
                checked={picked.includes(p.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))}
              />
              <span className="text-content">{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function NewKey({ keyValue, mcpUrl, onDone }: { keyValue: string; mcpUrl: string; onDone: () => void }) {
  const claudeCode = `claude mcp add --transport http oprix ${mcpUrl} --header "Authorization: Bearer ${keyValue}"`;
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30">
        <p className="text-sm font-semibold text-content">Copy your key now — you won&apos;t see it again</p>
        <p className="mb-2 mt-0.5 text-xs text-muted">Treat it like a password. Anyone with it can act as you through the API.</p>
        <CopyField value={keyValue} label="key" />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Claude Code</p>
        <CopyField value={claudeCode} label="command" />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Any other MCP tool</p>
        <p className="text-sm text-muted">
          URL <code className="text-content">{mcpUrl}</code>, header{" "}
          <code className="text-content">Authorization: Bearer &lt;key&gt;</code> (or{" "}
          <code className="text-content">X-API-Key: &lt;key&gt;</code> where only a custom header can be set).
        </p>
      </div>
      <Button variant="secondary" onClick={onDone}>
        I&apos;ve saved it
      </Button>
    </div>
  );
}

function ConnectionItem({ c, canRevoke }: { c: ConnectionRow; canRevoke: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function revoke() {
    void (async () => {
      const ok = await confirmDialog({
        title: "Revoke this connection?",
        message: `“${c.name}” stops working immediately. This can't be undone.`,
        tone: "danger",
        confirmLabel: "Revoke",
      });
      if (!ok) return;
      start(async () => {
        const res = await revokeApiConnection(c.id);
        if (res.ok) {
          toast.success("Revoked");
          router.refresh();
        } else {
          toast.error(res.error ?? "Couldn't revoke.");
        }
      });
    })();
  }
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-content">{c.name}</span>
          <Badge tone="gray">{c.kind === "KEY" ? `Key ${c.keyPrefix ?? ""}…` : "Signed-in app"}</Badge>
          {c.status !== "active" && <Badge tone={c.status === "revoked" ? "red" : "amber"}>{c.status === "revoked" ? "Revoked" : "Expired"}</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {c.access} · {c.projects}
        </p>
        <p className="mt-0.5 text-xs text-faint">
          Created {c.created} · {c.status === "active" ? `expires ${c.expires}` : "no longer works"} ·{" "}
          {c.lastUsed ? `last used ${c.lastUsed}` : "never used"}
        </p>
      </div>
      {canRevoke && c.status === "active" && (
        <Button size="sm" variant="secondary" onClick={revoke} disabled={pending}>
          Revoke
        </Button>
      )}
    </li>
  );
}
