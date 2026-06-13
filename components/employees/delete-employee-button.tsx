"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { softDeleteEmployee } from "@/lib/employees/actions";
import { Button } from "@/components/ui/button";

export function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function onDelete() {
    if (!confirm(`Remove ${name} from the directory?`)) return;
    start(async () => {
      const res = await softDeleteEmployee(id);
      if (res.error) alert(res.error);
      else router.push("/employees");
    });
  }

  return (
    <Button variant="danger" size="sm" onClick={onDelete} disabled={pending}>
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
