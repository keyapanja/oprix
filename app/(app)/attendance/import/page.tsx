import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { ImportPanel } from "@/components/attendance/import-panel";
import { CodeMap } from "@/components/attendance/code-map";
import { listImports } from "@/lib/attendance/records";
import { formatISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Import attendance · Oprix" };

export default async function AttendanceImportPage() {
  const session = await requirePage("attendance:manage");

  const [employees, history] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, employeeCode: true, machineCode: true },
    }),
    listImports(session.companyId, 8),
  ]);

  const people = employees.map((e) => ({ value: e.id, label: `${e.fullName} · ${e.employeeCode}` }));
  const last = history[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <BackLink href="/attendance">Back to attendance</BackLink>
      </div>

      <PageHeader
        title="Import attendance"
        description="Load the punch device's daily report. Re-importing a period replaces it, so an overlapping export is safe."
      />

      <div className="space-y-6">
        <ImportPanel people={people} lastImport={last ? { id: last.id, unmatched: last.unmatched } : null} />

        <CodeMap
          employees={employees.map((e) => ({
            id: e.id,
            name: e.fullName,
            employeeCode: e.employeeCode,
            machineCode: e.machineCode,
          }))}
        />

        {history.length > 0 && (
          <Card>
            <CardHeader title="Recent imports" description="What has been loaded, and the period each file covered." />
            <CardBody className="px-0 py-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                    <th className="px-5 py-3">File</th>
                    <th className="px-5 py-3">Period</th>
                    <th className="px-5 py-3 text-right">Days stored</th>
                    <th className="px-5 py-3 text-right">Unplaced rows</th>
                    <th className="px-5 py-3">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.map((h) => (
                    <tr key={h.id} className="hover:bg-canvas">
                      <td className="max-w-56 truncate px-5 py-3 font-medium text-content" title={h.fileName}>{h.fileName}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted">
                        {formatISO(h.from)} – {formatISO(h.to)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted">{h.rowsSaved}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {h.rowsSkipped > 0 ? <Badge tone="amber">{h.rowsSkipped}</Badge> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-xs text-muted">
                        {h.uploadedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="How the figures are worked out" />
          <CardBody className="space-y-2 text-sm leading-relaxed text-muted">
            <p>
              Each day&apos;s hours are the first scan to the last, and lateness is measured from the person&apos;s work-shift
              start plus its grace window — set per shift in{" "}
              <Link href="/organization" className="font-medium text-accent-strong hover:underline">
                Organization → Company → Work shifts
              </Link>
              . Someone with no shift assigned has no lateness, because there is nothing to be late for.
            </p>
            <p>
              The device&apos;s own summary columns are stored alongside, unchanged, and shown next to ours. Where the two part
              company — hours counted as zero on a day with a full punch trail, or no lateness recorded on a late arrival — the
              day is marked as needing a decision rather than being reconciled automatically.
            </p>
            <p>
              Weekly-off rows with no scans aren&apos;t stored: non-working days come from the company work week and the holiday
              list, which Oprix already uses for leave. Days somebody worked on their day off <em>are</em> kept, and show up as
              such.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
