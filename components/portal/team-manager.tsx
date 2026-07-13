"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteTeamMember, removeTeamMember } from "@/lib/portal/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

type Member = {
  id: string;
  email: string;
  accepted: boolean;
  isPrimary: boolean;
  lastLoginAt: Date | string | null;
};

export function TeamManager({
  team,
  isPrimary,
  currentUserId,
}: {
  team: Member[];
  isPrimary: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function invite() {
    const e = email.trim();
    if (!e) return;
    start(async () => {
      const res = await inviteTeamMember(e);
      if (res.error) return toast.error(res.error);
      setEmail("");
      toast.success(res.delivered ? "Invite sent" : "Invite created — email couldn't be delivered, share the link from your admin.");
      router.refresh();
    });
  }

  async function remove(m: Member) {
    if (!(await confirmDialog({ message: `Remove ${m.email} from the portal?`, tone: "danger", confirmLabel: "Remove" }))) return;
    setBusyId(m.id);
    const res = await removeTeamMember(m.id);
    setBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success("Removed");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {isPrimary && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-content">Invite a team member</p>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-56 flex-1">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    invite();
                  }
                }}
                placeholder="name@company.com"
              />
            </div>
            <Button onClick={invite} disabled={pending || !email.trim()}>
              <Icon name="plus" className="size-4" /> {pending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="divide-y divide-line overflow-hidden">
        {team.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="gradient-brand flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                {m.email.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-content">
                  {m.email}
                  {m.id === currentUserId && <span className="text-faint"> (you)</span>}
                </p>
                <p className="text-xs text-faint">
                  {m.accepted ? "Active" : "Invite pending"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {m.isPrimary && <Badge tone="blue">Primary contact</Badge>}
              {isPrimary && !m.isPrimary && m.id !== currentUserId && (
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
          </div>
        ))}
      </Card>
    </div>
  );
}
