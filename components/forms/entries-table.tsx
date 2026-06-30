"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSubmission } from "@/lib/forms/actions";
import { answerToText, isInputField, type FieldDef } from "@/lib/forms/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

type Row = {
  id: string;
  data: Record<string, unknown>;
  submitterName: string;
  mine: boolean;
  createdAt: string;
};

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function EntriesTable({
  formTitle,
  fields,
  rows,
  canDeleteAny,
}: {
  formTitle: string;
  fields: FieldDef[];
  rows: Row[];
  canDeleteAny: boolean;
}) {
  const router = useRouter();
  const cols = useMemo(() => fields.filter((f) => isInputField(f.type)), [fields]);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.submitterName.toLowerCase().includes(s) ||
        cols.some((c) => answerToText(c, r.data[c.id]).toLowerCase().includes(s)),
    );
  }, [rows, q, cols]);

  function exportCsv() {
    const header = ["Submitted by", "Date", ...cols.map((c) => c.label)];
    const body = filtered.map((r) => [
      r.submitterName,
      new Date(r.createdAt).toLocaleString(),
      ...cols.map((c) => answerToText(c, r.data[c.id])),
    ]);
    const csv = [header, ...body].map((row) => row.map((cell) => csvCell(String(cell ?? ""))).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "form"}-entries.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(id: string) {
    const ok = await confirmDialog({ message: "Delete this entry? This can't be undone.", tone: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    start(async () => {
      const res = await deleteSubmission(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Entry deleted");
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="w-56 max-w-full">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entries…" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{filtered.length} entr{filtered.length === 1 ? "y" : "ies"}</span>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Icon name="download" className="size-4" />
            CSV
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-muted">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Submitted by</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Date</th>
                {cols.map((c) => (
                  <th key={c.id} className="whitespace-nowrap px-4 py-2.5 font-medium">{c.label}</th>
                ))}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-canvas">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-content">{r.submitterName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                  {cols.map((c) => (
                    <td key={c.id} className="max-w-xs truncate px-4 py-2.5 text-content" title={answerToText(c, r.data[c.id])}>
                      {answerToText(c, r.data[c.id]) || "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    {(canDeleteAny || r.mine) && (
                      <button
                        onClick={() => remove(r.id)}
                        disabled={pending}
                        className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-red-600 disabled:opacity-50"
                        title="Delete entry"
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
