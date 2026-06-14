"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DeleteButton } from "@/components/org/delete-button";
import { ServiceChecklistEditor } from "@/components/org/service-checklist-editor";
import { Icon } from "@/components/ui/icons";

type Svc = {
  id: string;
  name: string;
  departmentName: string | null;
  checklist: { id: string; text: string }[];
};

export function ServiceList({ services }: { services: Svc[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Svc | null>(null);

  return (
    <>
      <Card>
        {services.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No services yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Checklist</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-canvas">
                  <td className="px-5 py-3 font-medium text-content">{s.name}</td>
                  <td className="px-5 py-3 text-muted">{s.departmentName ?? "—"}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setEditing(s)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1 text-xs font-medium text-content hover:bg-accent-soft hover:text-accent-strong"
                    >
                      <Icon name="check" className="size-3.5" />
                      {s.checklist.length} item{s.checklist.length === 1 ? "" : "s"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <DeleteButton entity="service" id={s.id} label={s.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <Modal
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
          title={`${editing.name} · checklist`}
        >
          <ServiceChecklistEditor serviceId={editing.id} initial={editing.checklist} />
        </Modal>
      )}
    </>
  );
}
