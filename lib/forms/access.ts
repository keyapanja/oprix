import "server-only";
import type { Role, Form } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

// Who can do what with a form. Building/managing is the `form:manage` capability
// (Super Admin always). Filling/viewing is per-form: audienceRoles gate access,
// viewAllRoles gate seeing everyone's entries (vs. only your own).

export async function canManageForms(session: SessionUser): Promise<boolean> {
  return hasPermission(session.companyId, session.role, "form:manage");
}

type AccessFields = Pick<Form, "status" | "audienceRoles" | "viewAllRoles">;

/** A staff user may open & submit a published form if their role is in the audience. */
export function audienceAllows(form: AccessFields, role: Role): boolean {
  return form.status === "PUBLISHED" && form.audienceRoles.includes(role);
}

/** Whether this role sees every entry (true) or only their own (false). */
export function viewAllAllows(form: AccessFields, role: Role): boolean {
  return form.viewAllRoles.includes(role);
}
