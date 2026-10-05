import Link from "next/link";
import { cn } from "@/lib/cn";

// Sections of one person's record. Separate routes rather than client-side tabs,
// so an attendance view can be linked to, opened in a new tab, and bookmarked
// with its date range intact.
export function EmployeeTabs({
  employeeId,
  active,
  showAttendance,
}: {
  employeeId: string;
  active: "overview" | "attendance";
  showAttendance: boolean;
}) {
  if (!showAttendance) return null;
  const tabs = [
    { key: "overview" as const, label: "Overview", href: `/employees/${employeeId}` },
    { key: "attendance" as const, label: "Attendance", href: `/employees/${employeeId}/attendance` },
  ];
  return (
    <div className="mb-6 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            active === t.key
              ? "border-brand-600 text-content"
              : "border-transparent text-muted hover:border-line-strong hover:text-content",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
