"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { CommentEditor } from "@/components/tasks/comment-editor";

type Person = { id: string; name: string };

export function CommentForm({ taskId, people }: { taskId: string; people: Person[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [editorKey, setEditorKey] = useState(0); // bump to remount → clear the editor
  const [pending, start] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await addComment(taskId, text);
      if (res.error) toast.error(res.error);
      else {
        setBody("");
        setEditorKey((k) => k + 1);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <CommentEditor
        key={editorKey}
        value=""
        onChange={setBody}
        people={people}
        uploadUrl={`/api/tasks/${taskId}/comment-images`}
        onSubmit={submit}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
