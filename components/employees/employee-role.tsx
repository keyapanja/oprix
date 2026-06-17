"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { setEmployeeRole } from "@/lib/employees/actions";
import { ROLE_LABELS } from "@/lib/auth/can";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toast";

const BASE: Role[] = ["EMPLOYEE", "TEAM_LEAD", "PROJECT_MANAGER", "HR_MANAGER"];

/** Inline role picker for an employee, gated to roles:manage on the server. */
export function EmployeeRole({
  employeeId,
  role,
  canGrantSuperAdmin,
}: {
  employeeId: string;
  role: Role;
  canGrantSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [value, setValue] = useState<string>(role);

  // Super Admin only appears if the viewer can grant it (or the person already is one).
  const roleList: Role[] =
    canGrantSuperAdmin || role === "SUPER_ADMIN" ? [...BASE, "SUPER_ADMIN"] : BASE;
  const options = roleList.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }));

  function onChange(next: string) {
    if (next === value) return;
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await setEmployeeRole(employeeId, next as Role);
      if (res.error) {
        setValue(prev);
        toast.error(res.error);
      } else {
        toast.success("Role updated");
        router.refresh();
      }
    });
  }

  return (
    <div className="min-w-44">
      <Combobox value={value} onChange={onChange} options={options} />
    </div>
  );
}
