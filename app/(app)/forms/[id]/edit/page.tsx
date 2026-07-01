import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { getFormForManage } from "@/lib/forms/data";
import { parseSchedule } from "@/lib/forms/schedule";
import { FormBuilder } from "@/components/forms/form-builder";

export const metadata: Metadata = { title: "Edit form · Oprix" };

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage("form:manage");
  const { id } = await params;
  const form = await getFormForManage(session, id);
  if (!form) notFound();

  return (
    <FormBuilder
      initial={{
        id: form.id,
        title: form.title,
        description: form.description,
        status: form.status,
        schema: form.schema,
        audienceRoles: form.audienceRoles,
        viewAllRoles: form.viewAllRoles,
        portalEnabled: form.portalEnabled,
        allowMultiple: form.allowMultiple,
        notifyEnabled: form.notifyEnabled,
        notifySchedule: parseSchedule(form.notifySchedule),
      }}
    />
  );
}
