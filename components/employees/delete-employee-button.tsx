"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { softDeleteEmployee } from "@/lib/employees/actions";
import { Button } from "@/components/ui/button";

export function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  async function onDelete() {
    if (!(await confirmDialog({ message: `Remove ${name} from the directory?`, tone: "danger", confirmLabel: "Remove" }))) return;
    start(async () => {
      const res = await softDeleteEmployee(id);
      if (res.error) toast.error(res.error);
      else router.push("/employees");
    });
  }

  return (
    <Button variant="danger" size="sm" onClick={onDelete} disabled={pending}>
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
