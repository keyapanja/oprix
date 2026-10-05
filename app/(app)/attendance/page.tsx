import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { getRoster, importedRange } from "@/lib/attendance/records";
import { hoursMin } from "@/lib/attendance/punches";
import { formatISO, shiftISO, todayISO } from "@/lib/dates";
import { RosterTable } from "@/components/attendance/roster-table";
import { RangeNav } from "@/components/attendance/range-nav";

export const metadata: Metadata = { title: "Attendance · Oprix" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requirePage("attendance:manage");
  const { from: rawFrom, to: rawTo } = await searchParams;

  const covered = await importedRange(session.companyId);
  const today = todayISO();
  const to = rawTo && ISO.test(rawTo) ? min(rawTo, today) : min(covered?.to ?? today, today);
  const from = rawFrom && ISO.test(rawFrom) ? min(rawFrom, to) : min(covered?.from ?? shiftISO(to, -29), to);

  const { people } = await getRoster({ companyId: session.companyId, from, to });

  const scanned = people.filter((p) => p.daysWorked > 0 || p.absences > 0);
  const unmapped = people.filter((p) => !p.machineCode);
  const totals = {
    hours: scanned.reduce((s, p) => s + p.totalMin, 0),
    late: scanned.reduce((s, p) => s + p.lateDays, 0),
    absent: scanned.reduce((s, p) => s + p.absences, 0),
    flagged: scanned.reduce((s, p) => s + p.flagged, 0),
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        description={
          covered
            ? `Imported from the punch device · ${formatISO(covered.from)} to ${formatISO(covered.to)}`
            : "Nothing imported yet."
        }
        action={
          <Link href="/attendance/import">
            <Button>
              <Icon name="download" className="size-4" />
              Import device report
            </Button>
          </Link>
        }
      />

      {!covered ? (
        <Card>
          <CardBody className="py-16 text-center">
            <p className="text-sm text-muted">
              Upload the punch device&apos;s Daily Attendance Report and Oprix will place each day against the right person.
            </p>
            <Link href="/attendance/import" className="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline">
              Import your first report →
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardBody className="flex flex-wrap items-end gap-x-6 gap-y-4">
              <RangeNav from={from} to={to} covered={covered} />
              <div className="ml-auto flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Stat label="On site" value={hoursMin(totals.hours)} />
                <Stat label="Late arrivals" value={String(totals.late)} tone={totals.late ? "amber" : undefined} />
                <Stat label="Absences" value={String(totals.absent)} tone={totals.absent ? "red" : undefined} />
                <Stat label="Need a decision" value={String(totals.flagged)} tone={totals.flagged ? "amber" : undefined} />
              </div>
            </CardBody>
          </Card>

          {unmapped.length > 0 && (
            <Card>
              <CardBody className="flex flex-wrap items-center gap-3">
                <Badge tone="amber">{unmapped.length} without a device code</Badge>
                <p className="min-w-0 flex-1 text-sm text-muted">
                  Nothing imports for {unmapped.length === 1 ? "this person" : "these people"} until their enrolment number on
                  the device is mapped: {unmapped.slice(0, 6).map((p) => p.name).join(", ")}
                  {unmapped.length > 6 ? ` and ${unmapped.length - 6} more` : ""}.
                </p>
                <Link href="/attendance/import" className="text-sm font-medium text-accent-strong hover:underline">
                  Map codes →
                </Link>
              </CardBody>
            </Card>
          )}

          <RosterTable people={people} from={from} to={to} />
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "red" }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p
        className={
          tone === "red"
            ? "text-base font-semibold text-red-600 dark:text-red-400"
            : tone === "amber"
              ? "text-base font-semibold text-amber-600 dark:text-amber-400"
              : "text-base font-semibold text-content"
        }
      >
        {value}
      </p>
    </div>
  );
}

const min = (a: string, b: string) => (a < b ? a : b);
