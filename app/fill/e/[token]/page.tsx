import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedEntry } from "@/lib/forms/data";
import { publicFields } from "@/lib/forms/actions";
import { isInputField, isVisible } from "@/lib/forms/types";
import { publicLogoSrc } from "@/lib/forms/public-logo";
import { EntryAnswers } from "@/components/forms/entry-answers";
import { Card } from "@/components/ui/card";

// Someone's answers: no reason for a search engine to keep a copy.
export const metadata: Metadata = { title: "Form entry", robots: { index: false, follow: false } };

// Anyone with the link, like the form's own public page. The token is the whole
// authorisation: minted when someone shares this entry, cleared when they stop,
// and honoured only while the form is published with its public link on.
export default async function SharedEntryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entry = await getSharedEntry(token);
  if (!entry) notFound();

  // The same fields the public form shows — dynamic lists are company data —
  // and only the ones the answers made visible.
  const fields = (await publicFields(entry.form.schema.fields)).filter(
    (f) => isInputField(f.type) && isVisible(f, entry.data),
  );
  const logo = publicLogoSrc(`/fill/e/${token}/logo`, entry.company);
  const when = (d: Date) => companyTime(d, entry.company.timezone);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-9 rounded-lg object-cover" />
        ) : (
          <span className="gradient-brand flex size-9 items-center justify-center rounded-lg font-display text-sm font-semibold text-white">
            {entry.company.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <p className="text-sm font-medium text-muted">{entry.company.name}</p>
      </div>

      <Card>
        <div className="border-b border-line px-6 py-5">
          <h1 className="text-lg font-semibold text-content">{entry.form.title}</h1>
          <p className="mt-1 text-sm text-muted">
            Submitted {when(entry.createdAt)}
            {entry.editedAt && ` · last edited ${when(entry.editedAt)}`}
          </p>
        </div>
        <div className="px-6 py-5">
          {fields.length ? (
            <EntryAnswers fields={fields} data={entry.data} />
          ) : (
            <p className="text-sm text-muted">This entry has no answers to show.</p>
          )}
        </div>
      </Card>

      <p className="mt-6 text-center text-xs text-faint">
        Shared by {entry.company.name}. Anyone with this link can see this entry.
      </p>
    </div>
  );
}

/** A moment in the company's own timezone — the server's clock runs in UTC. */
function companyTime(d: Date, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  try {
    return d.toLocaleString("en-IN", { ...opts, timeZone });
  } catch {
    // An unrecognised zone name shouldn't take the page down.
    return d.toLocaleString("en-IN", { ...opts, timeZone: "UTC" });
  }
}
