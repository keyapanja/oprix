export type PortalTone = "gray" | "green" | "amber" | "blue" | "red";

/**
 * How a task's status is shown to the client.
 *
 * Everything that isn't finished or waiting on them collapses to "In progress",
 * so the portal never exposes the team's internal pipeline — a client has no
 * business seeing that their request is in Redo, or sitting in internal review.
 *
 * This lives in one place on purpose. It was copied identically into two pages,
 * and a rule about what clients may see is exactly the kind of thing that must
 * not drift between copies.
 */
export function taskPill(status: string): { tone: PortalTone; label: string } {
  if (status === "COMPLETED") return { tone: "green", label: "Done" };
  if (status === "CLIENT_REVIEW") return { tone: "amber", label: "Needs your review" };
  return { tone: "blue", label: "In progress" };
}
