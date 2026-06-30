import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { getFormForFill } from "@/lib/forms/data";
import { submitForm } from "@/lib/forms/actions";
import { FormFill } from "@/components/forms/form-fill";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Form · Oprix" };

export default async function FillFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage();
  const { id } = await params;
  const access = await getFormForFill(session, id);
  if (!access) notFound();
  const { form, canManage, canViewAll } = access;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/forms">Back to forms</BackLink>
        <div className="flex items-center gap-2">
          {(canManage || canViewAll) && (
            <Link href={`/forms/${form.id}/entries`}>
              <Button variant="secondary" size="sm">
                <Icon name="chart" className="size-4" />
                Entries
              </Button>
            </Link>
          )}
          {canManage && (
            <Link href={`/forms/${form.id}/edit`}>
              <Button variant="secondary" size="sm">
                <Icon name="pencil" className="size-4" />
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>

      {form.status !== "PUBLISHED" && canManage && (
        <div className="mx-auto mb-4 max-w-xl rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25">
          This form is <strong>{form.status.toLowerCase()}</strong> — only you (a form manager) can see it. Publish it from the builder to open it up.
        </div>
      )}

      <FormFill
        form={{ id: form.id, title: form.title, description: form.description, schema: form.schema }}
        allowMultiple={form.allowMultiple}
        action={submitForm}
      />
    </div>
  );
}
