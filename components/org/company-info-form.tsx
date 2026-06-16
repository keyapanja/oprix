"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCompanyInfo } from "@/lib/org/actions";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";

type FormState = {
  name: string;
  tagline: string;
  businessType: string;
  website: string;
  email: string;
  phone: string;
  address: string;
};

export type CompanyInfo = {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  businessType: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export function CompanyInfoForm({ company }: { company: CompanyInfo }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: company.name,
    tagline: company.tagline ?? "",
    businessType: company.businessType ?? "",
    website: company.website ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    address: company.address ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set =
    (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updateCompanyInfo(form);
      if (res.error) setErr(res.error);
      else {
        setMsg("Company info saved.");
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-content">Company profile</h3>
      <p className="mt-0.5 text-sm text-muted">
        Personalize the platform for your business — your name and tagline appear in the sidebar.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Company logo" className="sm:col-span-2">
          <ImageUpload
            endpoint="/api/org/logo"
            hasImage={!!company.logoUrl}
            preview={
              company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logoUrl}
                  alt="Company logo"
                  className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-inset ring-line"
                />
              ) : (
                <span className="gradient-brand flex size-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white">
                  {(form.name || "?").slice(0, 1).toUpperCase()}
                </span>
              )
            }
            hint="Shown in the sidebar — PNG, JPG or WEBP, up to 5 MB"
          />
        </Field>
        <Field label="Company name" htmlFor="ci-name" required className="sm:col-span-2">
          <Input id="ci-name" value={form.name} onChange={set("name")} placeholder="Acme Inc." />
        </Field>
        <Field label="Tagline" htmlFor="ci-tagline" hint="Shown under your name in the sidebar" className="sm:col-span-2">
          <Input id="ci-tagline" value={form.tagline} onChange={set("tagline")} placeholder="e.g. Digital marketing agency" />
        </Field>
        <Field label="Business type" htmlFor="ci-type">
          <Input id="ci-type" value={form.businessType} onChange={set("businessType")} placeholder="e.g. Agency" />
        </Field>
        <Field label="Website" htmlFor="ci-website">
          <Input id="ci-website" value={form.website} onChange={set("website")} placeholder="https://acme.com" />
        </Field>
        <Field label="Email" htmlFor="ci-email">
          <Input id="ci-email" type="email" value={form.email} onChange={set("email")} placeholder="hello@acme.com" />
        </Field>
        <Field label="Phone" htmlFor="ci-phone">
          <Input id="ci-phone" value={form.phone} onChange={set("phone")} placeholder="+1 555 000 1234" />
        </Field>
        <Field label="Address" htmlFor="ci-address" className="sm:col-span-2">
          <Textarea id="ci-address" value={form.address} onChange={set("address")} placeholder="Street, city, country" className="min-h-16" />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {msg && <span className="text-sm text-green-600 dark:text-green-400">{msg}</span>}
        {err && <span className="text-sm text-red-600 dark:text-red-400">{err}</span>}
      </div>
    </Card>
  );
}
