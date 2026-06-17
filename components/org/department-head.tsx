"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDepartmentHead } from "@/lib/org/actions";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toast";

/** Inline picker to set/clear a department's head from the company's employees. */
export function DepartmentHead({
  departmentId,
  headId,
  employees,
}: {
  departmentId: string;
  headId: string | null;
  employees: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [value, setValue] = useState(headId ?? "");

  function onChange(next: string) {
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await setDepartmentHead(departmentId, next || null);
      if (res.error) {
        setValue(prev);
        toast.error(res.error);
      } else {
        toast.success(next ? "Department head set" : "Department head cleared");
        router.refresh();
      }
    });
  }

  return (
    <div className="min-w-44 max-w-56">
      <Combobox
        value={value}
        onChange={onChange}
        options={employees}
        emptyLabel="— None —"
        placeholder="— None —"
      />
    </div>
  );
}
