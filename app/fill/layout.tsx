import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";

// The no-login fill page lives outside the app shell: no sidebar, no session,
// nothing that assumes a signed-in user. Just the form, on a plain canvas.
export default function FillLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 sm:py-12">
      {children}
      <Toaster />
    </main>
  );
}
