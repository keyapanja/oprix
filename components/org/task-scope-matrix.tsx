"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { setTaskScope } from "@/lib/permissions/actions";
import { EDITABLE_ROLES, ROLE_LABELS } from "@/lib/auth/can";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type TaskScope = "ALL" | "TEAM" | "OWN";

const SCOPES: { value: TaskScope; label: string; description: string }[] = [
  { value: "ALL", label: "All tasks", description: "Every task in the company" },
  { value: "TEAM", label: "Team tasks", description: "Their department's tasks, plus their own" },
  { value: "OWN", label: "Own tasks", description: "Only tasks assigned to or created by them" },
];

export function TaskScopeMatrix({ initial }: { initial: Record<string, string> }) {
  const [scopes, setScopes] = useState<Record<string, TaskScope>>(() => {
    const m: Record<string, TaskScope> = {};
    for (const role of EDITABLE_ROLES) m[role] = (initial[role] as TaskScope) ?? "OWN";
    return m;
  });
  const [pending, start] = useTransition();

  function set(role: Role, scope: TaskScope) {
    const prev = scopes[role];
    if (prev === scope) return;
    setScopes((s) => ({ ...s, [role]: scope })); // optimistic
    start(async () => {
      const res = await setTaskScope(role, scope);
      if (res.error) {
        setScopes((s) => ({ ...s, [role]: prev }));
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-sm font-semibold text-content">Task visibility</h3>
        <p className="mt-0.5 text-sm text-muted">
          Choose how much of the task board each role sees on the Tasks page. Super Admin always sees all tasks.
        </p>
      </div>

      <div className="divide-y divide-line">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="text-sm font-medium text-content">Super Admin</span>
          <span className="rounded-lg bg-canvas px-3 py-1.5 text-sm text-muted">All tasks (always)</span>
        </div>
        {EDITABLE_ROLES.map((role) => (
          <div key={role} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="text-sm font-medium text-content">{ROLE_LABELS[role] ?? role}</span>
            <div className="inline-flex rounded-xl bg-canvas p-0.5">
              {SCOPES.map((sc) => (
                <button
                  key={sc.value}
                  type="button"
                  disabled={pending}
                  title={sc.description}
                  onClick={() => set(role, sc.value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                    scopes[role] === sc.value ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
                  )}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
