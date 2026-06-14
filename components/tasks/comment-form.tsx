"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/projects/actions";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CommentForm({ taskId }: { taskId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await addComment(taskId, text);
      if (res.error) alert(res.error);
      else {
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment…"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
