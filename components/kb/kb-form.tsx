"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createArticle, updateArticle, type ArticleInput } from "@/lib/kb/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { RichTextEditor } from "@/components/kb/rich-text-editor";

type Project = { id: string; name: string };
type Dept = { id: string; name: string };
type Svc = { id: string; name: string; departmentId: string | null };

export function KbForm({
  projects,
  departments,
  services,
  projectServices,
  initial,
  articleId,
}: {
  projects: Project[];
  departments: Dept[];
  services: Svc[];
  /** Which services each project uses — drives the service list once a project is picked. */
  projectServices: { projectId: string; serviceId: string }[];
  initial?: { title: string; body: string; projectId: string; departmentId: string; serviceId: string; keywords: string };
  articleId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? "");
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? "");
  const [keywords, setKeywords] = useState(initial?.keywords ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A project scopes the services to the ones it actually uses; otherwise fall
  // back to the chosen department, otherwise show everything.
  const serviceOpts = useMemo(() => {
    let list = services;
    if (projectId) {
      const allowed = new Set(projectServices.filter((ps) => ps.projectId === projectId).map((ps) => ps.serviceId));
      list = services.filter((s) => allowed.has(s.id));
    } else if (departmentId) {
      list = services.filter((s) => s.departmentId === departmentId);
    }
    return list.map((s) => ({ value: s.id, label: s.name }));
  }, [services, projectServices, projectId, departmentId]);

  function onServiceChange(v: string) {
    setServiceId(v);
    const svc = services.find((s) => s.id === v);
    if (svc?.departmentId && !departmentId) setDepartmentId(svc.departmentId);
  }

  function submit() {
    setError(null);
    if (!title.trim()) return setError("Title is required");
    if (!body.trim()) return setError("Write some content");
    const input: ArticleInput = {
      title: title.trim(),
      body,
      projectId: projectId || "",
      departmentId: departmentId || "",
      serviceId: serviceId || "",
      keywords: keywords || "",
    };
    start(async () => {
      const res = articleId ? await updateArticle(articleId, input) : await createArticle(input);
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/knowledge-base/${res.id}`);
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="kb-title" required className="sm:col-span-2">
            <Input id="kb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How to publish a blog post" />
          </Field>
          <Field label="Project" hint="SOPs differ per project — pick the one this guide is for" className="sm:col-span-2">
            <Combobox
              value={projectId}
              onChange={(v) => { setProjectId(v); setServiceId(""); }}
              emptyLabel="— None (applies to all projects) —"
              placeholder="— None (applies to all projects) —"
              searchPlaceholder="Search projects…"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Department" hint="Group this guide under a department">
            <Combobox
              value={departmentId}
              onChange={(v) => { setDepartmentId(v); setServiceId(""); }}
              emptyLabel="— None —"
              placeholder="— None —"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Field>
          <Field label="Service" hint="Auto-shows on tasks of this service">
            <Combobox value={serviceId} onChange={onServiceChange} emptyLabel="— None —" placeholder="— None —" options={serviceOpts} />
          </Field>
          <Field label="Keywords" htmlFor="kb-keywords" hint="Comma-separated, helps search" className="sm:col-span-2">
            <Input id="kb-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="blog, publishing, wordpress" />
          </Field>
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-sm font-medium text-content">Content</span>
          <RichTextEditor value={body} onChange={setBody} placeholder="Write the guide… format with the toolbar above." />
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : articleId ? "Save changes" : "Publish article"}
        </Button>
      </div>
    </div>
  );
}
