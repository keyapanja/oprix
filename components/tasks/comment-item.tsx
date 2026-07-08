"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { editComment, deleteComment } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { CommentEditor } from "@/components/tasks/comment-editor";
import { renderMarkdown } from "@/lib/kb/markdown";

type Person = { id: string; name: string };

export function CommentItem({
  id,
  taskId,
  people,
  authorName,
  authorEmpId,
  body,
  time,
  isMine,
}: {
  id: string;
  taskId: string;
  people: Person[];
  authorName: string;
  authorEmpId: string | null;
  body: string;
  time: string;
  isMine: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [pending, start] = useTransition();

  function save() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const res = await editComment(id, t);
      if (res.error) toast.error(res.error);
      else {
        setEditing(false);
        toast.success("Comment updated");
        router.refresh();
      }
    });
  }

  function remove() {
    void (async () => {
      const ok = await confirmDialog({ message: "Delete this comment?", tone: "danger", confirmLabel: "Delete" });
      if (!ok) return;
      start(async () => {
        const res = await deleteComment(id);
        if (res.error) toast.error(res.error);
        else {
          toast.success("Comment deleted");
          router.refresh();
        }
      });
    })();
  }

  return (
    <li className="group flex gap-3">
      <span className="gradient-brand mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
        {authorName.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm">
          {authorEmpId ? (
            <Link href={`/people/${authorEmpId}`} className="font-medium text-content hover:text-accent-strong hover:underline">
              {authorName}
            </Link>
          ) : (
            <span className="font-medium text-content">{authorName}</span>
          )}
          <span className="text-xs text-faint">{time}</span>
          {isMine && !editing && (
            <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => {
                  setText(body);
                  setEditing(true);
                }}
                className="rounded p-1 text-faint hover:bg-canvas hover:text-content"
                aria-label="Edit comment"
              >
                <Icon name="pencil" className="size-3.5" />
              </button>
              <button
                onClick={remove}
                disabled={pending}
                className="rounded p-1 text-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
                aria-label="Delete comment"
              >
                <Icon name="trash" className="size-3.5" />
              </button>
            </span>
          )}
        </p>
        {editing ? (
          <div className="mt-1 space-y-2">
            <CommentEditor
              value={body}
              onChange={setText}
              people={people}
              uploadUrl={`/api/tasks/${taskId}/comment-images`}
              onSubmit={save}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={pending || !text.trim()}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="comment-body mt-0.5 text-sm text-content [&_img]:my-1.5 [&_img]:max-h-72 [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img]:ring-1 [&_img]:ring-inset [&_img]:ring-line [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5"
            // Safe: renderMarkdown escapes all input first, then layers a fixed
            // Markdown subset (img srcs allowlisted to /… and http(s)).
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
          />
        )}
      </div>
    </li>
  );
}
