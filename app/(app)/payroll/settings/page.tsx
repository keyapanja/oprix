import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { getPtSlabs, getCompanyPayrollFlags } from "@/lib/payroll/data";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/ui/back-link";
import { StatutorySettings } from "@/components/payroll/statutory-settings";
import { PtSlabsManager } from "@/components/payroll/pt-slabs-manager";

export const metadata: Metadata = { title: "Payroll settings · Operix" };

export default async function PayrollSettingsPage() {
  const session = await requirePage("payroll:manage");
  const [slabs, flags] = await Promise.all([
    getPtSlabs(session.companyId),
    getCompanyPayrollFlags(session.companyId),
  ]);

  return (
    <>
      <div className="mb-3">
        <BackLink href="/payroll">Payroll</BackLink>
      </div>
      <PageHeader title="Payroll settings" description="Statutory deductions applied during each payroll run." />

      <div className="space-y-6">
        <StatutorySettings pfEnabled={flags.pfEnabled} esiEnabled={flags.esiEnabled} />
        <PtSlabsManager slabs={slabs} />
      </div>
    </>
  );
}
