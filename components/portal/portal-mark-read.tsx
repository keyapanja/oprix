"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/lib/notifications/actions";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

/** "Mark all as read" for the portal notifications page (scoped to the caller). */
export function PortalMarkRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markNotificationsRead();
          router.refresh();
        })
      }
    >
      <Icon name="check" className="size-4" />
      {pending ? "Marking…" : "Mark all as read"}
    </Button>
  );
}
