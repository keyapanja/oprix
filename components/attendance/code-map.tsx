"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { mapMachineCode } from "@/lib/attendance/admin";
import { cn } from "@/lib/cn";

export type MapRow = { id: string; name: string; employeeCode: string; machineCode: string | null };

/**
 * The standing device-code → person map, editable from the other direction: not
 * "who owns this unclaimed code" but "what is this person's number on the
 * device". Needed because the report only carries first names, so the enrolment
 * number is the only thing that reliably identifies anyone in it.
 */
export function CodeMap({ employees }: { employees: MapRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);

  const mapped = employees.filter((e) => e.machineCode).length;

  function save(row: MapRow) {
    const next = (edits[row.id] ?? row.machineCode ?? "").trim();
    if (next === (row.machineCode ?? "")) return;
    setSaving(row.id);
    start(async () => {
      const body = new FormData();
      body.append("employeeId", row.id);
      body.append("code", next);
      const res = await mapMachineCode({}, body);
      setSaving(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(next ? `${row.name} → device code ${next}` : `Cleared ${row.name}'s device code`);
      setEdits((e) => {
        const copy = { ...e };
        delete copy[row.id];
        return copy;
      });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="Device codes"
        description={`${mapped} of ${employees.length} people have their enrolment number on the device recorded.`}
        action={
          <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Edit codes"}
          </Button>
        }
      />
      {open && (
        <CardBody className="px-0 py-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Person</th>
                <th className="px-5 py-3">Oprix code</th>
                <th className="px-5 py-3">Device code</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((e) => {
                const value = edits[e.id] ?? e.machineCode ?? "";
                const dirty = value.trim() !== (e.machineCode ?? "");
                return (
                  <tr key={e.id} className="hover:bg-canvas">
                    <td className="px-5 py-2.5 font-medium text-content">{e.name}</td>
                    <td className="px-5 py-2.5 text-muted">{e.employeeCode}</td>
                    <td className="px-5 py-2.5">
                      <Input
                        value={value}
                        onChange={(ev) => setEdits((s) => ({ ...s, [e.id]: ev.target.value }))}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") save(e);
                        }}
                        placeholder="—"
                        className={cn("h-8 w-28", !e.machineCode && !value && "ring-amber-300 dark:ring-amber-500/40")}
                        aria-label={`Device code for ${e.name}`}
                      />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {dirty ? (
                        <Button size="sm" onClick={() => save(e)} disabled={pending && saving === e.id}>
                          {pending && saving === e.id ? "Saving…" : "Save"}
                        </Button>
                      ) : e.machineCode ? (
                        <Badge tone="green">
                          <Icon name="check" className="size-3" />
                          Set
                        </Badge>
                      ) : (
                        <Badge tone="amber">Not set</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      )}
    </Card>
  );
}
