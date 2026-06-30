import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { listSubmissions } from "@/lib/forms/data";
import { EntriesTable } from "@/components/forms/entries-table";
import { BackLink } from "@/components/ui/back-link";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Form entries · Oprix" };

export default async function FormEntriesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage();
  const { id } = await params;
  const data = await listSubmissions(session, id);
  if (!data) notFound();

  return (
    <div>
      <div className="mb-4">
        <BackLink href={`/forms/${id}`}>Back to form</BackLink>
      </div>
      <PageHeader
        title={`${data.form.title} — entries`}
        description={data.canViewAll ? "All responses to this form." : "Your responses to this form."}
      />
      <EntriesTable
        formTitle={data.form.title}
        fields={data.form.schema.fields}
        rows={data.rows}
        canDeleteAny={data.canManage}
        showSubmitter={data.canViewAll}
      />
    </div>
  );
}
