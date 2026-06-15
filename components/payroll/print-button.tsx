"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      <Icon name="download" className="size-4" />
      Print / Save as PDF
    </Button>
  );
}
