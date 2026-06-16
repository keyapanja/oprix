"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyProfile } from "@/lib/profile/actions";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ImageUpload } from "@/components/ui/image-upload";

export function ProfileEditForm({
  initial,
  fullName,
}: {
  initial: { nickname: string; avatarUrl: string; bio: string };
  fullName: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initial.nickname);
  const [bio, setBio] = useState(initial.bio);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updateMyProfile({ nickname, bio });
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
          endpoint="/api/profile/avatar"
          hasImage={!!initial.avatarUrl}
          preview={<Avatar name={fullName} src={initial.avatarUrl || null} size="lg" />}
          hint="PNG, JPG or WEBP — up to 5 MB"
        />
      </Field>

      <Field label="Nickname" htmlFor="pf-nick" hint="Shown across the app in place of your full name">
        <Input id="pf-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Sam" />
      </Field>

      <Field label="About" htmlFor="pf-bio">
        <Textarea id="pf-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio…" className="min-h-20" />
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
