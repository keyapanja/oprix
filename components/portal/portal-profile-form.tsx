"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyPortalProfile } from "@/lib/portal/actions";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { DatePicker } from "@/components/ui/date-picker";
import { ImageUpload } from "@/components/ui/image-upload";

export type PortalProfileInitial = {
  nickname: string;
  bio: string;
  phone: string;
  dateOfBirth: string;
  avatarUrl: string;
};

/**
 * Self-service profile for a portal user. Deliberately shorter than the
 * employee version — no employment details and no emergency contacts, which
 * are HR concerns a client has no business filling in.
 */
export function PortalProfileForm({
  initial,
  displayName,
}: {
  initial: PortalProfileInitial;
  displayName: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initial.nickname);
  const [bio, setBio] = useState(initial.bio);
  const [phone, setPhone] = useState(initial.phone);
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updateMyPortalProfile({ nickname, bio, phone, dateOfBirth });
      if (res.error) setErr(res.error);
      else {
        setMsg("Profile saved.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <Field label="Profile picture">
        <ImageUpload
          endpoint="/api/portal/avatar"
          hasImage={!!initial.avatarUrl}
          preview={<Avatar name={displayName} src={initial.avatarUrl || null} size="lg" />}
          hint="Pick a photo to crop · saved as a square, under 2 MB"
          crop
        />
      </Field>

      <Field label="Nickname" htmlFor="pp-nick" hint="Shown in place of your email around the portal">
        <Input
          id="pp-nick"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. Sam"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Phone" htmlFor="pp-phone">
          <Input
            id="pp-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +91 98765 43210"
          />
        </Field>
        <Field label="Date of birth">
          <DatePicker value={dateOfBirth} onChange={setDateOfBirth} />
        </Field>
      </div>

      <Field label="About" htmlFor="pp-bio">
        <Textarea
          id="pp-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short bio…"
          className="min-h-20"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {msg && <span className="text-sm text-green-600 dark:text-green-400">{msg}</span>}
        {err && <span className="text-sm text-red-600 dark:text-red-400">{err}</span>}
      </div>
    </div>
  );
}
