"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/projects/actions";
import { clientAddComment } from "@/lib/portal/actions";
import { Button } from "@/components/ui/button";
import { CommentEditor } from "@/components/tasks/comment-editor";

type Person = { id: string; name: string };

/**
 * The box for adding a task comment. The team and the client share one thread;
 * `portal` switches to the client's side of it — the portal action (which checks
 * portal access, not task access) and the portal image upload route.
 */
export function CommentForm({ taskId, people, portal = false }: { taskId: string; people: Person[]; portal?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [editorKey, setEditorKey] = useState(0); // bump to remount → clear the editor
  const [pending, start] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await (portal ? clientAddComment : addComment)(taskId, text);
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
        uploadUrl={portal ? `/api/portal/tasks/${taskId}/comment-images` : `/api/tasks/${taskId}/comment-images`}
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
