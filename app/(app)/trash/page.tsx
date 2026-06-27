import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { getTrash } from "@/lib/trash/data";
import { TrashView } from "@/components/trash/trash-view";

export const metadata: Metadata = { title: "Trash · Oprix" };

export default async function TrashPage() {
  const session = await requirePage();
  // Trash is Super-Admin only — defense in depth alongside the nav gating.
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const items = await getTrash(session.companyId);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-content">Trash</h1>
        <p className="mt-1 text-sm text-muted">
          Everything deleted across the platform lands here instead of being erased. Restore anything —
          this view is visible to Super Admins only.
        </p>
      </header>
      <TrashView items={items} />
    </div>
  );
}
