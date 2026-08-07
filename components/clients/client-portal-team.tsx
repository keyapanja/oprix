"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteClientTeamMember, removeClientTeamMember } from "@/lib/clients/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

export type PortalMember = {
  id: string;
  email: string;
  accepted: boolean;
  isPrimary: boolean;
  lastLogin: string | null;
};

export function ClientPortalTeam({
  clientId,
  clientEmail,
  members,
}: {
  clientId: string;
  clientEmail: string | null;
  members: PortalMember[];
}) {
  const router = useRouter();
  const empty = members.length === 0;
  const [email, setEmail] = useState(empty ? clientEmail ?? "" : "");
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function sendInvite(to: string, resend = false) {
    const e = to.trim();
    if (!e) return;
    start(async () => {
      const res = await inviteClientTeamMember(clientId, e);
      if (res.error) return toast.error(res.error);
      if (!resend) setEmail("");
      toast.success(
        res.delivered
          ? resend
            ? "Invite resent."
            : "Invite sent."
          : "Invite created — email isn't configured, so share the set-password link from the server log.",
      );
      router.refresh();
    });
  }

  async function remove(m: PortalMember) {
    const ok = await confirmDialog({
      message: `Remove ${m.email}'s access to this portal?`,
      tone: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusyId(m.id);
    const res = await removeClientTeamMember(clientId, m.id);
    setBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success("Access removed.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-content">Portal access</span>
        {!empty && (
          <Badge tone="green">
            {members.length} {members.length === 1 ? "person" : "people"}
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted">
        Everyone here can sign in to this client&apos;s portal — view projects, approve deliverables and raise
        tasks. Invite as many of their team as you need.
      </p>

      {!empty && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="gradient-brand flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white">
                  {m.email.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">{m.email}</p>
                  <p className="text-xs text-muted">
                    {m.accepted
                      ? m.lastLogin
                        ? `Last seen ${m.lastLogin}`
                        : "Active — hasn't signed in yet"
                      : "Invite pending"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {m.isPrimary && <Badge tone="blue">Primary</Badge>}
                {!m.accepted && (
                  <button
                    type="button"
                    onClick={() => sendInvite(m.email, true)}
                    disabled={pending}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-content disabled:opacity-50"
                  >
                    Resend
                  </button>
                )}
                {!m.isPrimary && (
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    disabled={busyId === m.id}
                    className="rounded-lg p-2 text-faint transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
                    aria-label={`Remove ${m.email}`}
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendInvite(email);
              }
            }}
            placeholder={empty ? "client@email.com" : "teammate@email.com"}
          />
        </div>
        <Button onClick={() => sendInvite(email)} disabled={pending || !email.trim()} size="sm">
          <Icon name="mail" className="size-4" />
          {pending ? "Sending…" : empty ? "Send invite" : "Invite team member"}
        </Button>
      </div>
    </div>
  );
}
