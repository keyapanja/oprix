"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { mapMachineCode, reimportStoredFile, setMachineCodeIgnored } from "@/lib/attendance/admin";
import { formatISO } from "@/lib/dates";
import type { ImportSummary, UnmatchedCode } from "@/lib/attendance/import";

// Uploading the device's report. The upload goes to a route handler rather than a
// server action because a year's report would clear the 1 MB action body cap.
//
// There is no preview step on purpose: a re-import replaces the days it covers,
// so the honest flow is to import, see which device codes nobody claimed, map
// them, and run the same stored file again. Nothing is lost by going second.

export function ImportPanel({
  people,
  lastImport,
  ignoredCodes,
}: {
  people: { value: string; label: string }[];
  lastImport: { id: string; unmatched: string | null } | null;
  /** Device codes written off as nobody's; never shown as unclaimed. */
  ignoredCodes: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/attendance/import", { method: "POST", body });
      const json = (await res.json()) as { ok?: boolean; summary?: ImportSummary; error?: string };
      if (!res.ok || !json.ok || !json.summary) {
        setError(json.error ?? "Import failed.");
        return;
      }
      setSummary(json.summary);
      toast.success(`Imported ${json.summary.rowsSaved} days for ${json.summary.people} people`);
      router.refresh();
    } catch {
      setError("The upload didn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // The unmatched list survives a page refresh via the stored import, so mapping
  // codes still works after a reload or on a colleague's screen. That stored
  // string is a snapshot, so anything written off since is filtered out here —
  // a fresh import's own summary already excludes them.
  const written = new Set(ignoredCodes.map((c) => c.trim().toLowerCase()));
  const pending: UnmatchedCode[] = (
      summary?.unmatched ??
      (lastImport?.unmatched
        ? lastImport.unmatched
            .split("\n")
            .map((line) => {
              const [code, name] = line.split(" — ");
              return { code: (code ?? "").trim(), name: (name ?? "").trim(), rows: 0 };
            })
            .filter((u) => u.code)
        : [])
  ).filter((u) => !written.has(u.code.trim().toLowerCase()));
  const reimportId = summary?.importId ?? lastImport?.id ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Upload a report"
          description="Export “Daily Attendance Report (Detailed)” from the punch device and upload it unchanged — .xls, .xlsx or .csv."
        />
        <CardBody>
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-canvas"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                setFileName(file.name);
                void upload(file);
              }
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setFileName(file.name);
                  void upload(file);
                }
                e.target.value = "";
              }}
            />
            <Icon name="download" className="size-6 text-faint" />
            <span className="text-sm font-medium text-content">
              {busy ? "Reading the report…" : "Drop the file here, or click to choose"}
            </span>
            <span className="text-xs text-muted">
              {fileName && !busy ? fileName : "One row per person per day, as the device exports it"}
            </span>
          </label>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
              {error}
            </div>
          )}
        </CardBody>
      </Card>

      {summary && <SummaryCard summary={summary} />}

      {pending.length > 0 && (
        <UnclaimedCodes codes={pending} people={people} reimportId={reimportId} />
      )}

      {ignoredCodes.length > 0 && <IgnoredCodes codes={ignoredCodes} />}
    </div>
  );
}

function SummaryCard({ summary }: { summary: ImportSummary }) {
  const facts: { label: string; value: string }[] = [
    { label: "Period", value: `${formatISO(summary.fromDate)} – ${formatISO(summary.toDate)}` },
    { label: "Days", value: String(summary.days) },
    { label: "People matched", value: String(summary.people) },
    { label: "Days stored", value: String(summary.rowsSaved) },
    { label: "Rows read", value: String(summary.rowsRead) },
  ];
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2">Imported<Badge tone="green">{summary.fileName}</Badge></span>}
      />
      <CardBody className="space-y-4">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-5">
          {facts.map((f) => (
            <div key={f.label}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{f.label}</p>
              <p className="mt-0.5 text-sm font-medium text-content">{f.value}</p>
            </div>
          ))}
        </div>
        <ul className="space-y-1 text-sm text-muted">
          {summary.ignoredRows > 0 && (
            <li>
              · {summary.ignoredRows} rows belonged to device codes you&apos;ve written off, and were dropped.
            </li>
          )}
          {summary.restDaysSkipped > 0 && (
            <li>
              · {summary.restDaysSkipped} weekly-off rows with no scans were skipped — Oprix takes non-working days from the
              company work week, not the device.
            </li>
          )}
          {summary.manualKept > 0 && (
            <li>· {summary.manualKept} days an admin had marked by hand kept their status; the punch trail was attached to them.</li>
          )}
          {summary.unmatched.length > 0 && (
            <li className="text-amber-700 dark:text-amber-300">
              · {summary.unmatched.reduce((n, u) => n + u.rows, 0)} rows belong to {summary.unmatched.length} device{" "}
              {summary.unmatched.length === 1 ? "code" : "codes"} that match nobody — map them below and run the file again.
            </li>
          )}
          {summary.warnings.map((w) => (
            <li key={w} className="text-amber-700 dark:text-amber-300">· {w}</li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function UnclaimedCodes({
  codes,
  people,
  reimportId,
}: {
  codes: UnmatchedCode[];
  people: { value: string; label: string }[];
  reimportId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [rerunning, setRerunning] = useState(false);

  function writeOff(code: string) {
    start(async () => {
      const res = await setMachineCodeIgnored(code, true);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Device code ${code} written off`);
      router.refresh();
    });
  }

  function assign(code: string, employeeId: string) {
    if (!employeeId) return;
    start(async () => {
      const body = new FormData();
      body.append("employeeId", employeeId);
      body.append("code", code);
      const res = await mapMachineCode({}, body);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setDone((d) => new Set(d).add(code));
      toast.success(`Device code ${code} mapped`);
      router.refresh();
    });
  }

  async function rerun() {
    if (!reimportId) return;
    setRerunning(true);
    const res = await reimportStoredFile(reimportId);
    setRerunning(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Placed ${res.summary?.rowsSaved ?? 0} days for ${res.summary?.people ?? 0} people`);
    router.refresh();
  }

  const mapped = done.size;

  return (
    <Card>
      <CardHeader
        title="Device codes nobody claims"
        description="Point each one at a person and the next run places their days. The device's own test slots have nobody behind them — write those off."
        action={
          reimportId ? (
            <Button
              variant="secondary"
              size="sm"
              className="whitespace-nowrap"
              onClick={rerun}
              disabled={rerunning || mapped === 0}
            >
              {rerunning ? "Running…" : "Run the file again"}
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <ul className="divide-y divide-line">
          {codes.map((u) => (
            <li key={u.code} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-16 shrink-0 font-mono text-sm font-medium text-content">{u.code}</span>
              <span className="min-w-0 flex-1 text-sm text-muted">
                {u.name || "no name on the device"}
                {u.rows > 0 && <span className="text-faint"> · {u.rows} rows</span>}
              </span>
              {done.has(u.code) ? (
                <Badge tone="green">
                  <Icon name="check" className="size-3" />
                  Mapped
                </Badge>
              ) : (
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
                    <Combobox
                      options={people}
                      onChange={(id) => assign(u.code, id)}
                      placeholder="Map to…"
                      searchPlaceholder="Find a person…"
                      disabled={pending}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => writeOff(u.code)}
                    disabled={pending}
                    className="whitespace-nowrap"
                    title={`Stop reporting ${u.code} as unclaimed`}
                  >
                    Not a person
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {mapped > 0 && reimportId && (
          <p className="mt-3 text-xs text-muted">
            {mapped} {mapped === 1 ? "code" : "codes"} mapped. Run the file again to place the days they were holding.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function IgnoredCodes({ codes }: { codes: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function restore(code: string) {
    start(async () => {
      const res = await setMachineCodeIgnored(code, false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${code} will be reported again`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="Written-off device codes"
        description="Rows under these codes are dropped on import and never reported as unclaimed. Restore one if it turns out to be a person."
      />
      <CardBody className="flex flex-wrap gap-2">
        {codes.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1.5 rounded-full bg-canvas py-1 pl-3 pr-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-line-strong"
          >
            <span className="font-mono text-content">{code}</span>
            <button
              type="button"
              onClick={() => restore(code)}
              disabled={pending}
              className="rounded-full p-0.5 text-faint transition-colors hover:bg-surface hover:text-content disabled:opacity-50"
              aria-label={`Restore device code ${code}`}
              title="Report this code again"
            >
              <Icon name="x" className="size-3.5" />
            </button>
          </span>
        ))}
      </CardBody>
    </Card>
  );
}
