"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { RequestForm } from "@/components/leave/request-form";

type Opt = { id: string; name: string };

/** Manager action: open a modal to raise a leave request for any employee. */
export function AddLeaveButton({ employees, leaveTypes }: { employees: Opt[]; leaveTypes: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" className="size-4" />
        Add leave
      </Button>
      {open && (
        <Modal onClose={() => setOpen(false)} title="Add leave for an employee">
          <RequestForm
            employees={employees}
            leaveTypes={leaveTypes}
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
