import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { getRoster, importedRange, ruleOf } from "@/lib/attendance/records";
import { formatISO, todayISO } from "@/lib/dates";
import { RosterTable } from "@/components/attendance/roster-table";
import { RangeNav } from "@/components/attendance/range-nav";
import { BreakLimitSetting } from "@/components/attendance/break-limit";

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
  // This month so far by default — exactly what the picker's "This month"
  // preset writes, so that's what it shows as selected.
  const to = rawTo && ISO.test(rawTo) ? min(rawTo, today) : today;
  const from = rawFrom && ISO.test(rawFrom) ? min(rawFrom, to) : min(`${today.slice(0, 7)}-01`, to);

  const { people, breakLimit } = await getRoster({ companyId: session.companyId, from, to });
  const breakRule = ruleOf(breakLimit);

  const unmapped = people.filter((p) => !p.machineCode);
  // Only people who actually turned up matter here: a leaver with no shift and no
  // scans isn't a gap in the data, just an empty row.
  const shiftless = people.filter((p) => !p.shiftStart && p.daysWorked > 0);

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
            </CardBody>
            <div className="border-t border-line px-5 py-3">
              <BreakLimitSetting initial={breakLimit} />
            </div>
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

          {shiftless.length > 0 && (
            <Card>
              <CardBody className="flex flex-wrap items-center gap-3">
                <Badge tone="amber">{shiftless.length} without a work shift</Badge>
                <p className="min-w-0 flex-1 text-sm text-muted">
                  No lateness is measured for {shiftless.length === 1 ? "this person" : "these people"} — their hours are
                  right, but there&apos;s no shift start to be late against:{" "}
                  {shiftless.slice(0, 6).map((p) => p.name).join(", ")}
                  {shiftless.length > 6 ? ` and ${shiftless.length - 6} more` : ""}. Assign a work shift on their
                  employee record.
                </p>
                <Link href="/employees" className="text-sm font-medium text-accent-strong hover:underline">
                  Open employees →
                </Link>
              </CardBody>
            </Card>
          )}

          <RosterTable people={people} from={from} to={to} breakRule={breakRule} />
        </div>
      )}
    </>
  );
}

const min = (a: string, b: string) => (a < b ? a : b);
