import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { BackLink } from "@/components/ui/back-link";
import { NewFormCard } from "@/components/forms/new-form-card";

export const metadata: Metadata = { title: "New form · Oprix" };

export default async function NewFormPage() {
  await requirePage("form:manage");
  return (
    <div>
      <div className="mb-4">
        <BackLink href="/forms">Back to forms</BackLink>
      </div>
      <NewFormCard />
    </div>
  );
}
