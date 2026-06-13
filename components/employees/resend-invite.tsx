"use client";

import { useState, useTransition } from "react";
import { resendInvite } from "@/lib/employees/actions";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export function ResendInvite({ employeeId }: { employeeId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await resendInvite(employeeId);
            if (res.error) {
              setMsg({ text: res.error, error: true });
            } else {
              setMsg({
                text: res.delivered
                  ? "Invite email sent."
                  : "Invite re-issued — email isn't configured, so the link was logged to the server console.",
              });
            }
          })
        }
      >
        <Icon name="mail" className="size-4" />
        {pending ? "Sending…" : "Resend invite"}
      </Button>
      {msg && (
        <span className={msg.error ? "text-xs text-red-600" : "text-xs text-emerald-600"}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
