import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Companion extension · Oprix" };

const EXTENSION_ID = "cjmfclenldejgleeppfoaeekkfcdhgde";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Download & unzip",
    body: "Download the .zip below and unzip it to a permanent folder you won't delete or move — Chrome loads the extension live from that folder, so if you remove it the extension stops working.",
  },
  {
    title: "Open your extensions page",
    body: "In Chrome or Edge, go to chrome://extensions (or edge://extensions). You can't click that — type or paste it into the address bar.",
  },
  {
    title: "Turn on Developer mode",
    body: "Flip the “Developer mode” switch in the top-right corner of the extensions page.",
  },
  {
    title: "Load unpacked",
    body: "Click “Load unpacked” and select the unzipped oprix-extension folder (the one that contains manifest.json).",
  },
  {
    title: "Pin it",
    body: "Click the puzzle-piece icon in the toolbar and pin “Oprix Companion” so it's always one click away.",
  },
  {
    title: "Connect",
    body: "Click the Oprix Companion icon → “Connect to Oprix”. A tab opens on oprix.gowithepic.com — log in if needed and click Authorize. The tab closes itself and you're connected.",
  },
];

export default async function ExtensionPage() {
  const session = await requirePage();
  const isSuperAdmin = session.role === "SUPER_ADMIN";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Oprix Companion extension"
        description="A floating dock that pins your running tasks — with live timers, checklists, and related guides — to the edge of any web page while you work."
      />

      {/* Download */}
      <Card className="mb-6 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-content">Download the extension</h2>
          <p className="mt-1 text-sm text-muted">
            It isn't on the Chrome Web Store — you install it manually in Developer mode (one-time, ~1 minute).
            Works on Chrome and Edge.
          </p>
        </div>
        <a
          href="/oprix-extension.zip"
          download
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition-opacity hover:opacity-90"
        >
          <Icon name="download" className="size-4" />
          Download .zip
        </a>
      </Card>

      {/* Install steps */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-base font-semibold text-content">Install it (≈1 minute)</h2>
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-4">
              <span className="gradient-brand flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-content">{s.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {/* Using it */}
      <Card className="mb-6 p-6">
        <h2 className="mb-3 text-base font-semibold text-content">Using it</h2>
        <ul className="space-y-2 text-sm text-muted">
          <li className="flex gap-2">
            <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />
            Start a timer on any task in Oprix — it appears in the dock within a few seconds.
          </li>
          <li className="flex gap-2">
            <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />
            ▶ / ⏸ / ■ controls run the timer; expand a task to tick its checklist and open related guides.
          </li>
          <li className="flex gap-2">
            <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />
            Move, resize, theme, and toggle the dock from the toolbar popup. It auto-hides on Oprix itself.
          </li>
          <li className="flex gap-2">
            <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />
            Manage or disconnect it anytime from{" "}
            <a href="/profile/devices" className="font-medium text-accent-strong hover:underline">
              Connected devices
            </a>
            .
          </li>
        </ul>
      </Card>

      {/* Troubleshooting */}
      <Card className="mb-6 p-6">
        <h2 className="mb-3 text-base font-semibold text-content">Troubleshooting</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-content">The dock shows “Unknown request” or nothing loads</dt>
            <dd className="mt-0.5 text-muted">
              The background worker is on an old copy. Open chrome://extensions, click the ⟳ reload icon on Oprix
              Companion, then refresh the web page.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-content">“Connect” fails</dt>
            <dd className="mt-0.5 text-muted">
              Make sure you're signed in to oprix.gowithepic.com in the same browser, then try Connect again. If it
              still fails, your Oprix admin needs to finish the one-time server setup below.
            </dd>
          </div>
        </dl>
      </Card>

      {/* Admin-only: one-time server allow-list */}
      {isSuperAdmin && (
        <Card className="border-amber-200 bg-amber-50/60 p-6 dark:border-amber-500/25 dark:bg-amber-500/10">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="building" className="size-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-semibold text-content">Admin · one-time server setup</h2>
          </div>
          <p className="text-sm text-muted">
            For the extension to connect, the server must allow its id. The id is <strong>pinned</strong>, so it's
            the same for everyone — set this environment variable in Coolify once and redeploy:
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-canvas px-3 py-2 text-xs text-content ring-1 ring-inset ring-line">
            EXTENSION_ORIGINS=chrome-extension://{EXTENSION_ID}
          </code>
          <p className="mt-2 text-xs text-faint">
            After installing, you can confirm the id matches the one shown on the extension's card in
            chrome://extensions.
          </p>
        </Card>
      )}
    </div>
  );
}
