"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { revokeMyDevice } from "@/app/(app)/profile/devices/actions";

type Device = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function DevicesList({ devices }: { devices: Device[] }) {
  const [items, setItems] = useState(devices);
  const [pending, startTransition] = useTransition();

  async function onRevoke(id: string, label: string) {
    const ok = await confirmDialog({
      message: `Disconnect “${label}”? That extension will be signed out immediately.`,
      tone: "danger",
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await revokeMyDevice(id);
      if (res?.error) {
        toast.error(res.error);
      } else {
        setItems((xs) => xs.filter((x) => x.id !== id));
        toast.success("Device disconnected");
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
        No browser extensions are connected to your account yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="px-5 py-3">Device</th>
            <th className="px-5 py-3">Connected</th>
            <th className="px-5 py-3">Last used</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((d) => (
            <tr key={d.id}>
              <td className="px-5 py-3 font-medium text-content">{d.label}</td>
              <td className="px-5 py-3 text-muted">{fmtDate(d.createdAt)}</td>
              <td className="px-5 py-3 text-muted">{d.lastUsedAt ? fmtDate(d.lastUsedAt) : "—"}</td>
              <td className="px-5 py-3 text-right">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRevoke(d.id, d.label)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
                >
                  Disconnect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
