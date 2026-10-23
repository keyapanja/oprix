"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { adminRevokeConnection, setClientApiAccess } from "@/lib/api/actions";
import type { ApiAccountView } from "@/lib/api/data";

/** The team's switch for a client's API (MCP) access, and what's connected under it. */
export function ClientApiAccess({ clientId, view }: { clientId: string; view: ApiAccountView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showActivity, setShowActivity] = useState(false);
  const live = view.connections.filter((c) => c.status === "active");

  function toggle() {
    void (async () => {
      if (view.enabled) {
        const ok = await confirmDialog({
          title: "Switch API access off?",
          message: `This revokes all ${live.length} active key${live.length === 1 ? "" : "s"} and connected app${live.length === 1 ? "" : "s"} for this client, immediately.`,
          tone: "danger",
          confirmLabel: "Switch off",
        });
        if (!ok) return;
      }
      start(async () => {
        const res = await setClientApiAccess(clientId, !view.enabled);
        if (res.ok) {
          toast.success(view.enabled ? "API access switched off" : "API access switched on");
          router.refresh();
        } else {
          toast.error(res.error ?? "Couldn't change it.");
        }
      });
    })();
  }

  function revoke(id: string, name: string) {
    void (async () => {
      const ok = await confirmDialog({ message: `Revoke “${name}”? It stops working immediately.`, tone: "danger", confirmLabel: "Revoke" });
      if (!ok) return;
      start(async () => {
        const res = await adminRevokeConnection(id);
        if (res.ok) router.refresh();
        else toast.error(res.error ?? "Couldn't revoke.");
      });
    })();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-content">
            API access (Claude &amp; AI agents)
            <Badge tone={view.enabled ? "green" : "gray"}>{view.enabled ? "On" : "Off"}</Badge>
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Lets this client connect Claude to their portal: their projects, requests and deliverables, with the same
            limits as the portal. Saved logins are never reachable. Only their primary contact
            {view.primaryName ? ` (${view.primaryName})` : ""} can create keys or approve apps.
          </p>
        </div>
        <Button size="sm" variant={view.enabled ? "secondary" : "primary"} onClick={toggle} disabled={pending}>
          {view.enabled ? "Switch off" : "Switch on"}
        </Button>
      </div>

      {view.connections.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {view.connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-content">{c.name}</span>
                  <Badge tone="gray">{c.kind === "KEY" ? `Key ${c.keyPrefix ?? ""}…` : "Signed-in app"}</Badge>
                  {c.status !== "active" && <Badge tone={c.status === "revoked" ? "red" : "amber"}>{c.status === "revoked" ? "Revoked" : "Expired"}</Badge>}
                </p>
                <p className="text-xs text-faint">
                  {c.access} · {c.projects} · {c.lastUsed ? `last used ${c.lastUsed}` : "never used"}
                </p>
              </div>
              {c.status === "active" && (
                <Button size="sm" variant="ghost" onClick={() => revoke(c.id, c.name)} disabled={pending}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {view.activity.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowActivity((s) => !s)} className="text-xs font-medium text-muted hover:text-content">
            {showActivity ? "Hide" : "Show"} recent API activity ({view.activity.length})
          </button>
          {showActivity && (
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs">
              {view.activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="truncate text-muted">
                    {a.what} · {a.connection}
                    {!a.ok && <span className="text-red-600"> · failed</span>}
                  </span>
                  <span className="shrink-0 text-faint">{a.at}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
