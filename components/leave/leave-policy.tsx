import { Icon } from "@/components/ui/icons";

// Static, informational leave policy shown above the apply form. Purely
// reference text — no logic — so employees see the rules while applying.
// Collapsible (native <details>), open by default.
const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "General",
    items: [
      "No leave encashment.",
      "No leave clubbing without prior approval.",
      "On resignation or termination, leave is calculated pro-rata — Annual Paid Leave at 1 per month, Sick Leave at 1 per quarter.",
    ],
  },
  {
    title: "Applying",
    items: [
      "Sick leave: inform before 9:00 AM.",
      "1-day leave: apply at least 2 days in advance.",
      "2+ day leave: apply at least 15 days in advance.",
      "Late or last-minute requests without a valid reason will be rejected.",
      "All leave is subject to Team Lead + HR approval.",
      "No leave is allowed during probation or notice period.",
    ],
  },
  {
    title: "Leave Without Pay (LWP)",
    items: [
      "Applies once all paid leave is used, or during probation / notice period.",
      "Uninformed or unapproved leave becomes automatic LWP.",
      "Repeated LWP leads to a disciplinary review.",
    ],
  },
];

export function LeavePolicy() {
  return (
    <details open className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <Icon name="book" className="size-4 shrink-0 text-accent" />
        <span className="text-sm font-semibold text-content">Leave policy — please read before applying</span>
        <Icon
          name="chevronDown"
          className="ml-auto size-4 shrink-0 text-faint transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-4 border-t border-line px-5 py-4">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">{s.title}</h4>
            <ul className="space-y-1.5">
              {s.items.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm leading-snug text-muted">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-faint" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
