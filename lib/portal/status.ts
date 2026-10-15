export type PortalTone = "gray" | "green" | "amber" | "blue" | "red";

/**
 * How a task's status is shown to the client.
 *
 * Everything that isn't finished, paused or waiting on them collapses to
 * "In progress", so the portal never exposes the team's internal pipeline — a
 * client has no business seeing that their request is in Redo, or sitting in
 * internal review.
 *
 * On hold is the exception: the work has genuinely stopped, and saying
 * "In progress" would be untrue. It's gray, not amber, because amber here means
 * "your move" and a held task isn't waiting on the client.
 *
 * This lives in one place on purpose. It was copied identically into two pages,
 * and a rule about what clients may see is exactly the kind of thing that must
 * not drift between copies.
 */
export function taskPill(status: string): { tone: PortalTone; label: string } {
  if (status === "COMPLETED") return { tone: "green", label: "Done" };
  if (status === "CLIENT_REVIEW") return { tone: "amber", label: "Needs your review" };
  if (status === "HOLD") return { tone: "gray", label: "On hold" };
  return { tone: "blue", label: "In progress" };
}
