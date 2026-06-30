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
} from "@/lib/tasks/workflow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export function TaskWorkflow({
  taskId,
  status,
  finalLink,
  canSubmit,
  canReview,
}: {
  taskId: string;
  status: TaskStatus;
  finalLink: string | null;
  canSubmit: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState("");

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

  return (
    <div className="space-y-3">
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
              Changes were requested — update the work, then submit the new link or status.
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
      {inReview && canReview && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(() => approveComplete(taskId))} disabled={pending}>
            <Icon name="check" className="size-4" />
            Approve &amp; complete
          </Button>
          <Button variant="secondary" onClick={() => run(() => sendToClientReview(taskId))} disabled={pending}>
            Send to client review
          </Button>
          <Button variant="danger" onClick={() => run(() => requestChanges(taskId))} disabled={pending}>
            Request changes
          </Button>
        </div>
      )}
      {inReview && !canReview && <p className="text-sm text-muted">Submitted — waiting for review.</p>}

      {clientReview && canReview && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(() => approveComplete(taskId))} disabled={pending}>
            <Icon name="check" className="size-4" />
            Mark completed
          </Button>
          <Button variant="danger" onClick={() => run(() => requestChanges(taskId))} disabled={pending}>
            Request changes
          </Button>
        </div>
      )}
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
