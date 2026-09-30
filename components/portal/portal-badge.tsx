import { safeHref, isHttpUrl } from "@/lib/url";

/**
 * The "Made by …" chip in the corner of the client portal.
 *
 * Shown only when a name is set — clearing that field in Organization →
 * Company is what turns it off, so there's no separate flag to disagree with.
 *
 * The company logo doubles as the mark, so nothing extra needs uploading. The
 * link is optional and runs through `safeHref`/`isHttpUrl`, because the value
 * is admin-entered text and a `javascript:` URL would otherwise be live in
 * every client's browser.
 *
 * `preview` drops the fixed positioning so the admin page can show the real
 * component inline rather than a mock-up of it.
 */
export function PortalBadge({
  text,
  name,
  url,
  logoUrl,
  preview = false,
}: {
  text: string | null;
  name: string | null;
  url: string | null;
  logoUrl: string | null;
  preview?: boolean;
}) {
  const label = name?.trim();
  if (!label) return null;

  const lead = text?.trim();
  const href = url?.trim() && isHttpUrl(url.trim()) ? safeHref(url.trim()) : null;

  const chip = (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs shadow-card">
      {logoUrl && (
        // Same-origin API path with a cache-busting query — matches how the
        // sidebar renders it (components/shell/nav-list.tsx).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-4 shrink-0 rounded object-contain" />
      )}
      {lead && <span className="text-muted">{lead}</span>}
      <span className="font-semibold text-content">{label}</span>
    </span>
  );

  const inner = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="transition-opacity hover:opacity-80"
    >
      {chip}
    </a>
  ) : (
    chip
  );

  if (preview) return inner;

  // Sits above the page but below modals and the service-status pill (z-110),
  // and ignores pointer events except on the chip itself, so it can never
  // swallow a click meant for the content underneath.
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 print:hidden">
      <span className="pointer-events-auto">{inner}</span>
    </div>
  );
}
