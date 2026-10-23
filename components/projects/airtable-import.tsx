"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import type { ImportPreview, ImportResult } from "@/lib/import/airtable-import";

async function send(projectId: string, file: File, mode: "preview" | "import", client: string | null) {
  const form = new FormData();
  form.set("file", file);
  form.set("mode", mode);
  if (client) form.set("client", client);
  const res = await fetch(`/api/projects/${projectId}/import-airtable`, { method: "POST", body: form });
  return (await res.json().catch(() => ({ error: "The server didn't answer properly." }))) as
    | { preview?: ImportPreview; result?: ImportResult; error?: string };
}

/**
 * Upload the CSV, read the preview — what goes where, nothing written yet —
 * then import. The preview is the safety net: client rows, status and task
 * type mapping, dates and duplicates are all visible before anything happens.
 */
export function AirtableImport({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [client, setClient] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function load(f: File, chosen: string | null) {
    setError(null);
    setResult(null);
    start(async () => {
      const out = await send(projectId, f, "preview", chosen);
      if (out.preview) {
        setPreview(out.preview);
        setClient(out.preview.selectedClient);
      } else {
        setPreview(null);
        setError(out.error ?? "Couldn't read the file.");
      }
    });
  }

  async function runImport() {
    if (!file || !preview || !client) return;
    const ok = await confirmDialog({
      title: "Import these tasks?",
      message: `${preview.toImport} tasks from “${client}” will be added to ${preview.project.name}, assigned to ${preview.bm}. Nobody is notified.`,
      confirmLabel: `Import ${preview.toImport}`,
    });
    if (!ok) return;
    start(async () => {
      const out = await send(projectId, file, "import", client);
      if (out.result) {
        setResult(out.result);
        setPreview(null);
        toast.success(`Imported ${out.result.created} tasks`);
      } else {
        toast.error(out.error ?? "The import failed.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-content">1. Get the CSV from Airtable</h2>
        <p className="mt-1 text-sm text-muted">
          Open the shared view, click the view name, then <span className="font-medium text-content">Download CSV</span>.
          Upload it here within the hour: the file links inside it expire after a while, and attached files are copied
          from them.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm font-medium text-content shadow-sm ring-1 ring-inset ring-line-strong hover:bg-canvas">
            <Icon name="download" className="size-4 rotate-180" />
            {file ? "Choose another file" : "Choose the CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setFile(f);
                load(f, null);
              }}
            />
          </label>
          {file && <span className="truncate text-sm text-muted">{file.name}</span>}
          {pending && <span className="text-sm text-faint">Working…</span>}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      {preview && file && (
        <PreviewCard
          preview={preview}
          client={client}
          pending={pending}
          onClient={(v) => {
            setClient(v);
            load(file, v);
          }}
          onImport={runImport}
        />
      )}

      {result && <ResultCard result={result} projectId={projectId} />}
    </div>
  );
}

function PreviewCard({
  preview,
  client,
  pending,
  onClient,
  onImport,
}: {
  preview: ImportPreview;
  client: string | null;
  pending: boolean;
  onClient: (v: string) => void;
  onImport: () => void;
}) {
  const unknownStatus = preview.statuses.filter((s) => !s.known);
  const unmatched = preview.types.filter((t) => !t.to && t.from !== "(none)");
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-content">2. Check what will happen</h2>
      <p className="mt-1 text-xs text-faint">Nothing has been imported yet.</p>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Fact label="Project">
          {preview.project.name} · {preview.project.client}
        </Fact>
        <Fact label="Assigned to">{preview.bm} (Business Manager)</Fact>
        <Fact label="Raised by">{preview.creator}</Fact>
        <Fact label="Dates read as">{preview.dateOrder}</Fact>
      </dl>

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Client rows</p>
        {preview.clients.length > 1 ? (
          <div className="max-w-sm">
            <Combobox
              options={preview.clients.map((c) => ({ value: c.value, label: `${c.value || "(blank)"} · ${c.count}` }))}
              value={client ?? ""}
              onChange={onClient}
              placeholder="Which client's rows?"
            />
            <p className="mt-1.5 text-xs text-muted">Only the chosen client&apos;s rows are imported; the rest are left alone.</p>
          </div>
        ) : (
          <p className="text-sm text-content">
            All {preview.total} rows are for “{preview.clients[0]?.value}”.
          </p>
        )}
      </div>

      {client !== null && (
        <>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Badge tone="green">{preview.toImport} to import</Badge>
            {preview.alreadyImported > 0 && <Badge tone="gray">{preview.alreadyImported} already imported — skipped</Badge>}
            <Badge tone="gray">
              {preview.assets.files} file{preview.assets.files === 1 ? "" : "s"} on {preview.assets.tasks} task
              {preview.assets.tasks === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="mt-5 space-y-5">
            <MapTable
              title="Status"
              rows={preview.statuses.map((s) => ({ from: s.from, to: s.known ? s.to : `${s.to} (unrecognised)`, count: s.count }))}
            />
            <MapTable
              title="Task type"
              rows={preview.types.map((t) => ({ from: t.from, to: t.to ?? "— kept in the description", count: t.count }))}
              scroll
            />
          </div>
          {(unknownStatus.length > 0 || unmatched.length > 0) && (
            <p className="mt-3 text-xs text-muted">
              {unmatched.length > 0 &&
                `${unmatched.length === 1 ? "1 task type doesn't" : `${unmatched.length} task types don't`} match a type on this project; those tasks get no type and the Airtable type is noted in their description. `}
              {unknownStatus.length > 0 && "Unrecognised statuses become To Do."}
            </p>
          )}

          {preview.sample.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Oldest and newest, as read</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-faint">
                    <tr>
                      <th className="py-1 pr-4 font-medium">Task</th>
                      <th className="py-1 pr-4 font-medium">Created</th>
                      <th className="py-1 pr-4 font-medium">Deadline</th>
                      <th className="py-1 pr-4 font-medium">Delivered</th>
                      <th className="py-1 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.sample.map((s) => (
                      <tr key={s.ref}>
                        <td className="max-w-[16rem] py-1.5 pr-4">
                          <p className="truncate text-content">{s.name}</p>
                          <p className="text-xs text-faint">{s.ref}</p>
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-4 text-muted">{s.created}</td>
                        <td className="whitespace-nowrap py-1.5 pr-4 text-muted">{s.deadline}</td>
                        <td className="whitespace-nowrap py-1.5 pr-4 text-muted">{s.delivered}</td>
                        <td className="whitespace-nowrap py-1.5 text-muted">{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-xs text-faint">Check these against Airtable — if the dates are off, don&apos;t import.</p>
            </div>
          )}

          <div className="mt-5 flex justify-end border-t border-line pt-4">
            <Button onClick={onImport} disabled={pending || preview.toImport === 0}>
              {pending ? "Importing…" : preview.toImport === 0 ? "Nothing new to import" : `Import ${preview.toImport} tasks`}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-faint">{label}</dt>
      <dd className="min-w-0 text-content">{children}</dd>
    </div>
  );
}

function MapTable({
  title,
  rows,
  scroll,
}: {
  title: string;
  rows: { from: string; to: string; count: number }[];
  scroll?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">{title}</p>
      <ul className={scroll ? "max-h-64 space-y-1 overflow-y-auto pr-1" : "space-y-1"}>
        {rows.map((r) => (
          <li key={r.from} className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted" title={r.from}>
              {r.from}
            </span>
            <Icon name="chevronRight" className="size-3 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-content" title={r.to}>
              {r.to}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-faint">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultCard({ result, projectId }: { result: ImportResult; projectId: string }) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-content">
        <Icon name="check" className="size-4 text-accent-strong" />
        Import finished
      </h2>
      <ul className="mt-3 space-y-1 text-sm text-content">
        <li>{result.created} tasks imported</li>
        {result.skipped > 0 && <li className="text-muted">{result.skipped} skipped — already imported</li>}
        <li>{result.assetsCopied} files copied</li>
      </ul>
      {result.assetsFailed.length > 0 && (
        <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">
          <p className="font-medium text-content">{result.assetsFailed.length} files couldn&apos;t be copied</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {result.assetsFailed.map((f, i) => (
              <li key={i}>
                {f.ref} · {f.file} — {f.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">Attach these by hand on each task.</p>
        </div>
      )}
      <Link
        href={`/projects/${projectId}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
      >
        Go to the project
        <Icon name="chevronRight" className="size-4" />
      </Link>
    </Card>
  );
}
