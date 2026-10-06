import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicForm } from "@/lib/forms/data";
import { publicFields, submitPublicForm } from "@/lib/forms/actions";
import { FormFill } from "@/components/forms/form-fill";
import { publicLogoSrc } from "@/lib/forms/public-logo";

export const metadata: Metadata = { title: "Form" };

// Anyone with the link. The token in the URL is the whole authorisation: it's
// unguessable, it's only honoured while the form is published with the link
// switched on, and a form manager can replace it at any time.
export default async function PublicFillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await getPublicForm(token);
  if (!form) notFound();

  // Dynamic-list fields (clients, projects, employees) are company data and
  // don't go out on a public page; the submit path drops them the same way.
  const fields = await publicFields(form.schema.fields);
  const logo = publicLogoSrc(`/fill/${token}/logo`, form.company);
  const submit = async (_formId: string, data: Record<string, unknown>) => {
    "use server";
    return submitPublicForm(token, data);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-9 rounded-lg object-cover" />
        ) : (
          <span className="gradient-brand flex size-9 items-center justify-center rounded-lg font-display text-sm font-semibold text-white">
            {form.company.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <p className="text-sm font-medium text-muted">{form.company.name}</p>
      </div>

      <FormFill
        form={{
          id: form.id,
          title: form.title,
          description: form.description,
          schema: { fields, helpPosition: form.schema.helpPosition },
        }}
        allowMultiple={form.allowMultiple}
        action={submit}
      />

      <p className="mt-6 text-center text-xs text-faint">
        Responses go to {form.company.name}. Nothing here needs an account.
      </p>
    </div>
  );
}
