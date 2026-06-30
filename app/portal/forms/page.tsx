import type { Metadata } from "next";
import Link from "next/link";
import { requirePortal } from "@/lib/auth/guard";
import { listPortalForms } from "@/lib/forms/data";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Forms · Portal" };

export default async function PortalFormsPage() {
  const session = await requirePortal();
  const forms = await listPortalForms(session);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-content">Forms</h1>
      <p className="mt-1 text-sm text-muted">Forms shared with you.</p>

      {forms.length === 0 ? (
        <Card className="mt-6 px-5 py-16 text-center">
          <p className="text-sm text-muted">No forms have been shared with you yet.</p>
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {forms.map((f) => (
            <Link key={f.id} href={`/portal/forms/${f.id}`}>
              <Card hover className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-content">{f.title}</h3>
                  <Icon name="chevronRight" className="size-4 shrink-0 text-faint" />
                </div>
                {f.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{f.description}</p>}
                {f.submissions > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    You&apos;ve submitted {f.submissions} response{f.submissions === 1 ? "" : "s"}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
