"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

export type KbItem = {
  id: string;
  title: string;
  keywords: string | null;
  projectName: string | null;
  deptName: string | null;
  serviceName: string | null;
  updatedBy: string;
  updatedAt: string;
};

export function KbList({ items }: { items: KbItem[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((a) =>
      [a.title, a.keywords, a.projectName, a.deptName, a.serviceName].some((f) => f?.toLowerCase().includes(s)),
    );
  }, [items, q]);

  const groups = useMemo(() => {
    const m = new Map<string, KbItem[]>();
    for (const a of filtered) {
      const k = a.deptName ?? "General";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles…"
          className="h-10 w-full rounded-xl bg-surface pl-9 pr-3 text-sm text-content ring-1 ring-inset ring-line-strong placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {items.length === 0 ? (
        <Card className="px-5 py-16 text-center">
          <p className="text-sm text-muted">No articles yet — create the first guide.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No articles match your search.</p>
      ) : (
        groups.map(([dept, list]) => (
          <div key={dept}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-faint">{dept}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {list.map((a) => (
                <Link
                  key={a.id}
                  href={`/knowledge-base/${a.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-canvas"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                    <Icon name="book" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-content">{a.title}</span>
                      {a.projectName && (
                        <span className="inline-flex items-center gap-1 rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-300">
                          <Icon name="briefcase" className="size-2.5" />
                          {a.projectName}
                        </span>
                      )}
                      {a.serviceName && (
                        <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">{a.serviceName}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-faint">Updated by {a.updatedBy} · {a.updatedAt}</p>
                  </div>
                  <Icon name="chevronRight" className="size-4 shrink-0 text-faint" />
                </Link>
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
