"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { setRolePermission } from "@/lib/permissions/actions";
import {
  EDITABLE_ROLES,
  EDITABLE_ACTIONS,
  ACTION_LABELS,
  ROLE_LABELS,
  type Action,
} from "@/lib/auth/can";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function PermissionsMatrix({ initial }: { initial: Record<string, string[]> }) {
  const [granted, setGranted] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    for (const role of EDITABLE_ROLES) m[role] = new Set(initial[role] ?? []);
    return m;
  });
  const [pending, start] = useTransition();

  function toggle(role: Role, action: Action) {
    const has = granted[role].has(action);
    const apply = (add: boolean) =>
      setGranted((g) => {
        const next = { ...g, [role]: new Set(g[role]) };
        if (add) next[role].add(action);
        else next[role].delete(action);
        return next;
      });

    apply(!has); // optimistic
    start(async () => {
      const res = await setRolePermission(role, action, !has);
      if (res.error) {
        apply(has); // revert
        alert(res.error);
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-sm font-semibold text-content">Roles &amp; permissions</h3>
        <p className="mt-0.5 text-sm text-muted">
          Control what each role can access. Changes apply immediately. Super Admin
          always has full access.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
              <th className="px-5 py-3">Permission</th>
              <th className="px-3 py-3 text-center">Super Admin</th>
              {EDITABLE_ROLES.map((r) => (
                <th key={r} className="px-3 py-3 text-center">{ROLE_LABELS[r] ?? r}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {EDITABLE_ACTIONS.map((action) => {
              const meta = ACTION_LABELS[action];
              return (
                <tr key={action} className="hover:bg-canvas">
                  <td className="px-5 py-3">
                    <p className="font-medium text-content">{meta?.label ?? action}</p>
                    <p className="text-xs text-muted">{meta?.description}</p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Cell on disabled />
                  </td>
                  {EDITABLE_ROLES.map((role) => (
                    <td key={role} className="px-3 py-3 text-center">
                      <Cell
                        on={granted[role].has(action)}
                        disabled={pending}
                        onClick={() => toggle(role, action)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Cell({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-md border transition-colors",
        on
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-line-strong bg-surface hover:border-brand-400",
        !onClick && "cursor-default opacity-70",
        disabled && onClick && "opacity-50",
      )}
    >
      {on && <Icon name="check" className="size-3.5" />}
    </button>
  );
}
