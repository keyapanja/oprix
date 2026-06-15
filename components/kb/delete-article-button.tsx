"use client";

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
      onClick={() => {
        if (!confirm("Delete this article? This can't be undone.")) return;
        start(async () => {
          const r = await deleteArticle(id);
          if (r.error) alert(r.error);
          else router.push("/knowledge-base");
        });
      }}
    >
      <Icon name="trash" className="size-4" />
      Delete
    </Button>
  );
}
