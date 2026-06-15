"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteArticle } from "@/lib/kb/actions";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export function DeleteArticleButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmDialog({ message: "Delete this article? This can't be undone.", tone: "danger" }))) return;
        start(async () => {
          const r = await deleteArticle(id);
          if (r.error) toast.error(r.error);
          else router.push("/knowledge-base");
        });
      }}
    >
      <Icon name="trash" className="size-4" />
      Delete
    </Button>
  );
}
