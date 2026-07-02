import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type BalanceCard = {
  typeId: string;
  name: string;
  allowance: number;
  used: number;
  remaining: number;
  period: "MONTH" | "YEAR";
  unlimited: boolean;
};

/** Per-type leave balance summary shown to an employee above their requests. */
export function LeaveBalances({ balances }: { balances: BalanceCard[] }) {
  if (balances.length === 0) return null;

  return (
    <div className="mb-8">
      <h3 className="mb-3 text-sm font-semibold text-content">Your leave balance</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {balances.map((b) => {
          const per = b.period === "MONTH" ? "this month" : "this year";
          const pct = b.unlimited || b.allowance <= 0
            ? 0
            : Math.min(100, Math.round((b.used / b.allowance) * 100));
          return (
            <Card key={b.typeId} className="p-4">
              <p className="truncate text-sm font-medium text-content" title={b.name}>{b.name}</p>

              {b.unlimited ? (
                <>
                  <p className="mt-2 text-2xl font-semibold leading-none text-content">
                    {b.used}
                    <span className="ml-1 text-sm font-normal text-muted">taken</span>
                  </p>
                  <p className="mt-2 text-xs text-muted">No fixed limit · {per}</p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-semibold leading-none text-content">
                    {b.remaining}
                    <span className="ml-1 text-sm font-normal text-muted">of {b.allowance} left</span>
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : "gradient-brand")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">{b.used} taken · {per}</p>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
