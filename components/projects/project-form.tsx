"use client";

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/cn";

type Opt = { id: string; name: string };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const TYPES = [
  { value: "ONE_TIME", label: "One time" },
  { value: "RECURRING", label: "Recurring" },
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectForm({ clients, services }: { clients: Opt[]; services: Opt[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const q = query.trim().toLowerCase();

  function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    setFiles((f) => [...f, ...Array.from(e.target.files ?? [])]);
    e.target.value = "";
  }
  function removeFile(i: number) {
    setFiles((f) => f.filter((_, idx) => idx !== i));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    if (!String(fd.get("name") ?? "").trim()) return setError("Project name is required");

    start(async () => {
      const res = await createProject({}, fd);
      if (res.error) return setError(res.error);
      if (!res.id) return;

      if (files.length) {
        try {
          const upload = new FormData();
          for (const file of files) upload.append("files", file);
          const up = await fetch(`/api/projects/${res.id}/attachments`, { method: "POST", body: upload });
          if (!up.ok) {
            const j = await up.json().catch(() => ({}));
            // Toast (not inline error) so it survives the navigation below.
            toast.error(`Project created, but some files didn't upload: ${j.error || up.statusText}`);
          }
        } catch {
          toast.error("Project created, but some files didn't upload.");
        }
      }
      router.push(`/projects/${res.id}`);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {error}
        </div>
      )}

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" htmlFor="p-name" required className="sm:col-span-2">
            <Input id="p-name" name="name" placeholder="Website redesign" required />
          </Field>
          <Field label="Client">
            <Combobox name="clientId" emptyLabel="— None —" placeholder="— None —" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Type">
            <Combobox name="type" defaultValue="ONE_TIME" options={TYPES} />
          </Field>
          <Field label="Priority">
            <Combobox name="priority" defaultValue="MEDIUM" options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
          </Field>
          <Field label="Status">
            <Combobox name="status" defaultValue="PLANNING" options={STATUSES.map((s) => ({ value: s, label: humanizeEnum(s) }))} />
          </Field>
          <Field label="Start date">
            <DatePicker name="startDate" />
          </Field>
          <Field label="Due date">
            <DatePicker name="dueDate" />
          </Field>
          <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
            <Textarea id="p-desc" name="description" placeholder="What's this project about?" />
          </Field>

          {/* Attachments — uploaded to the project once it's created */}
          <Field label="Attachments" hint="Stored on the server · max 100 MB each" className="sm:col-span-2">
            <div>
              {files.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-canvas px-2.5 py-1.5 text-sm">
                      <Icon name="folder" className="size-4 shrink-0 text-faint" />
                      <span className="flex-1 truncate text-content">{f.name}</span>
                      <span className="shrink-0 text-xs text-faint">{fmtBytes(f.size)}</span>
                      <button type="button" onClick={() => removeFile(i)} className="shrink-0 text-faint hover:text-red-600" aria-label={`Remove ${f.name}`}>
                        <Icon name="x" className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface">
                <Icon name="plus" className="size-4" />
                Add files
                <input type="file" multiple className="hidden" onChange={onFilesPicked} />
              </label>
            </div>
          </Field>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-1 text-sm font-medium text-content">Categories</p>
          <p className="mb-2 text-xs text-muted">
            Pick the service categories this project covers. Tasks are created under their sub-categories.
          </p>
          {services.length === 0 ? (
            <p className="text-sm text-muted">
              No categories yet — add them in Organization → Services.
            </p>
          ) : (
            <>
              <div className="relative mb-3 max-w-xs">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search categories…"
                  className="h-9 w-full rounded-xl bg-surface pl-9 pr-3 text-sm text-content ring-1 ring-inset ring-line-strong placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  // Hidden (not unmounted) when filtered out, so checked services still submit.
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-sm text-content hover:bg-canvas",
                      q && !s.name.toLowerCase().includes(q) && "hidden",
                    )}
                  >
                    <input type="checkbox" name="serviceIds" value={s.id} className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500" />
                    {s.name}
                  </label>
                ))}
              </div>
              {q && !services.some((s) => s.name.toLowerCase().includes(q)) && (
                <p className="mt-2 text-sm text-muted">No categories match “{query}”.</p>
              )}
            </>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/projects">
          <Button type="button" variant="secondary">Cancel</Button>
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
