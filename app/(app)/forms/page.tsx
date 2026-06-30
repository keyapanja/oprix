import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { listFormsForUser } from "@/lib/forms/data";
import { FormsList } from "@/components/forms/forms-list";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Forms · Oprix" };

export default async function FormsPage() {
  const session = await requirePage();
  const { canManage, forms } = await listFormsForUser(session);

  return (
    <>
      <PageHeader
        title="Forms"
        description={canManage ? "Build forms and collect responses." : "Forms you can fill in."}
        action={
          canManage ? (
            <Link href="/forms/new">
              <Button>
                <Icon name="plus" className="size-4" />
                New form
              </Button>
            </Link>
          ) : undefined
        }
      />
      <FormsList forms={forms} canManage={canManage} />
    </>
  );
}
