"use client";

import { useState, useTransition } from "react";
import { addTaskAssignee, removeTaskAssignee } from "@/lib/projects/actions";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";

type Emp = { id: string; name: string };

export function TaskAssignees({
  taskId,
  initial,
  employees,
  canEdit,
}: {
  taskId: string;
  initial: Emp[];
  employees: Emp[];
  canEdit: boolean;
}) {
  const [list, setList] = useState<Emp[]>(initial);
  const [, start] = useTransition();
  const available = employees.filter((e) => !list.some((a) => a.id === e.id));

  function add(empId: string) {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    setList((l) => [...l, emp]);
    start(async () => {
      const res = await addTaskAssignee(taskId, empId);
      if (res.error) {
        setList((l) => l.filter((a) => a.id !== empId));
        alert(res.error);
      }
    });
  }
  function remove(empId: string) {
    const prev = list;
    setList((l) => l.filter((a) => a.id !== empId));
    start(async () => {
      const res = await removeTaskAssignee(taskId, empId);
      if (res.error) {
        setList(prev);
        alert(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.length === 0 && <span className="text-sm text-muted">No one assigned</span>}
      {list.map((a) => (
        <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-canvas py-1 pl-1 pr-2 text-sm text-content">
          <span className="gradient-brand flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white">
            {a.name.slice(0, 2).toUpperCase()}
          </span>
          {a.name}
          {canEdit && (
            <button onClick={() => remove(a.id)} className="text-faint hover:text-red-600" aria-label={`Remove ${a.name}`}>
              <Icon name="x" className="size-3.5" />
            </button>
          )}
        </span>
      ))}
      {canEdit && available.length > 0 && (
        <div className="w-48">
          <Combobox value="" onChange={add} placeholder="+ Add assignee" options={available.map((e) => ({ value: e.id, label: e.name }))} />
        </div>
      )}
    </div>
  );
}
