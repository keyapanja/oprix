"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteForm } from "@/lib/forms/actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

type Item = {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  submissions: number;
  updatedAt: string;
};

const TONE = { DRAFT: "gray", PUBLISHED: "green", CLOSED: "amber" } as const;
const titleCase = (s: string) => s[0] + s.slice(1).toLowerCase();

export function FormsList({ forms, canManage }: { forms: Item[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function remove(id: string, title: string) {
    const ok = await confirmDialog({
      message: `Delete “${title}”? It moves to Trash.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteForm(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Form deleted");
      router.refresh();
    });
  }

  if (forms.length === 0) {
    return (
      <Card className="px-5 py-16 text-center">
        <p className="text-sm text-muted">{canManage ? "No forms yet — create your first one." : "No forms available to you yet."}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {forms.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas">
            <Link href={`/forms/${f.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium text-content hover:text-accent">{f.title}</p>
              {f.description && <p className="truncate text-xs text-muted">{f.description}</p>}
            </Link>
            <Badge tone={TONE[f.status]}>{titleCase(f.status)}</Badge>
            <span className="w-20 text-right text-xs text-muted">
              {f.submissions} entr{f.submissions === 1 ? "y" : "ies"}
            </span>
            <div className="flex items-center gap-1">
              <Link
                href={`/forms/${f.id}/entries`}
                className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-content"
                title={canManage ? "Entries" : "My entries"}
              >
                <Icon name="chart" className="size-4" />
              </Link>
              {canManage && (
                <>
                  <Link href={`/forms/${f.id}/edit`} className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-content" title="Edit">
                    <Icon name="pencil" className="size-4" />
                  </Link>
                  <button
                    onClick={() => remove(f.id, f.title)}
                    disabled={pending}
                    className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-red-600 disabled:opacity-50"
                    title="Delete"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
