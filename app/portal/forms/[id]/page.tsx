import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/auth/guard";
import { getPortalForm } from "@/lib/forms/data";
import { getPortalLookups } from "@/lib/forms/lookups";
import { neededSources } from "@/lib/forms/types";
import { submitPortalForm } from "@/lib/forms/actions";
import { FormFill } from "@/components/forms/form-fill";
import { BackLink } from "@/components/ui/back-link";

export const metadata: Metadata = { title: "Form · Portal" };

export default async function PortalFillPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal();
  const { id } = await params;
  const form = await getPortalForm(session, id);
  if (!form) notFound();
  const lookups = await getPortalLookups(session, neededSources(form.schema.fields));

  return (
    <div>
      <div className="mb-4">
        <BackLink href="/portal/forms">Back to forms</BackLink>
      </div>
      <FormFill
        form={{ id: form.id, title: form.title, description: form.description, schema: form.schema }}
        allowMultiple={form.allowMultiple}
        action={submitPortalForm}
        lookups={lookups}
      />
    </div>
  );
}
