"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { safeHref, isHttpUrl } from "@/lib/url";
import {
  submitForReview,
  requestChanges,
  sendToClientReview,
  approveComplete,
  withdrawSubmission,
} from "@/lib/tasks/workflow";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export function TaskWorkflow({
  taskId,
  status,
  finalLink,
  changeRequest,
  canSubmit,
  canReview,
}: {
  taskId: string;
  status: TaskStatus;
  finalLink: string | null;
  changeRequest: string | null;
  canSubmit: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState("");
  // Reviewer's "request changes" note — the box opens inline when they click it.
  const [requesting, setRequesting] = useState(false);
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else router.refresh();
    });

  const working = status === "TODO" || status === "IN_PROGRESS" || status === "REDO";
  const inReview = status === "REVIEW";
  const clientReview = status === "CLIENT_REVIEW";
  const done = status === "COMPLETED";

  // Shared inline editor for the reviewer's change request (used from both the
  // internal-review and client-review action rows).
  const changeRequestBox = (
    <div className="space-y-2">
      <p className="text-sm font-medium text-content">What needs to change?</p>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Describe the changes the assignee should make…"
        className="min-h-24 text-sm"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          onClick={() => run(() => requestChanges(taskId, note))}
          disabled={pending || !note.trim()}
        >
          {pending ? "Sending…" : "Send request"}
        </Button>
        <Button variant="secondary" onClick={() => setRequesting(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted">
        The assignee is notified and the task returns to In progress (Redo) with your note attached.
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Outstanding change request — shown to everyone while the task is in Redo. */}
      {status === "REDO" && changeRequest && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <Icon name="pencil" className="size-3.5" />
            Changes requested
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-content">{changeRequest}</p>
        </div>
      )}

      {finalLink && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">
            {isHttpUrl(finalLink) ? "Submitted link" : "Submitted status"}
          </p>
          {isHttpUrl(finalLink) ? (
            <a
              href={safeHref(finalLink)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm font-medium text-accent-strong ring-1 ring-inset ring-line hover:bg-surface"
            >
              <Icon name="folder" className="size-4 shrink-0" />
              <span className="truncate">{finalLink}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line">
              <Icon name="check" className="size-4 shrink-0 text-faint" />
              <span className="break-words">{finalLink}</span>
            </div>
          )}
        </div>
      )}

      {/* Worker — submit (or resubmit) for review */}
      {working && canSubmit && (
        <div className="space-y-2">
          {status === "REDO" && (
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {changeRequest
                ? "Update the work to address the requested changes, then submit the new link or status."
                : "Changes were requested — update the work, then submit the new link or status."}
            </p>
          )}
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Final link (https://…) or a status note"
          />
          <Button onClick={() => run(() => submitForReview(taskId, link))} disabled={pending || !link.trim()}>
            Submit for review
          </Button>
        </div>
      )}
      {working && !canSubmit && <p className="text-sm text-muted">This task is being worked on.</p>}

      {/* Reviewer — review actions */}
      {inReview && canReview &&
        (requesting ? (
          changeRequestBox
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => approveComplete(taskId))} disabled={pending}>
              <Icon name="check" className="size-4" />
              Approve &amp; complete
            </Button>
            <Button variant="secondary" onClick={() => run(() => sendToClientReview(taskId))} disabled={pending}>
              Send to client review
            </Button>
            <Button variant="danger" onClick={() => setRequesting(true)} disabled={pending}>
              Request changes
            </Button>
          </div>
        ))}
      {inReview && !canReview && <p className="text-sm text-muted">Submitted — waiting for review.</p>}

      {/* Worker can pull the submission back to keep working */}
      {inReview && canSubmit && !requesting && (
        <div className="border-t border-line pt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run(() => withdrawSubmission(taskId))}
            disabled={pending}
          >
            <Icon name="arrowLeft" className="size-4" />
            Resume working
          </Button>
          <p className="mt-1.5 text-xs text-muted">
            Still something to finish? Pull this out of review — the submitted link is cleared and the
            task returns to In progress so you can continue.
          </p>
        </div>
      )}

      {clientReview && canReview &&
        (requesting ? (
          changeRequestBox
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => approveComplete(taskId))} disabled={pending}>
              <Icon name="check" className="size-4" />
              Mark completed
            </Button>
            <Button variant="danger" onClick={() => setRequesting(true)} disabled={pending}>
              Request changes
            </Button>
          </div>
        ))}
      {clientReview && !canReview && <p className="text-sm text-muted">Waiting for client review.</p>}

      {done && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <Icon name="check" className="size-4" />
          Completed
        </p>
      )}
    </div>
  );
}
