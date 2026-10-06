import "server-only";
import { NextResponse } from "next/server";
import { readUpload, mimeFromKey } from "@/lib/uploads";

// The company logo on the no-login pages — a public form and a shared entry.
//
// /api/org/logo can't serve it: that route finds the company from the session,
// and a public visitor has none — the proxy bounces the request to /login and
// the <img> receives an HTML page. So each public page has a logo route of its
// own under /fill/, found through the same token as the page and answering on
// exactly the same terms, which exposes nothing the page doesn't already show:
// the company's name sits right next to the logo.

/**
 * Where a public page should load the logo from. An uploaded logo goes through
 * that page's own token route (`route`); an older absolute URL is already
 * public and is used as it is.
 */
export function publicLogoSrc(route: string, company: { logoUrl: string | null; logoKey: string | null }): string | null {
  if (company.logoKey) {
    // Carry the upload's ?v= stamp across so a replaced logo is a new URL.
    const v = company.logoUrl?.match(/[?&]v=([^&]+)/)?.[1];
    return `${route}${v ? `?v=${v}` : ""}`;
  }
  if (company.logoUrl && /^https?:\/\//i.test(company.logoUrl)) return company.logoUrl;
  return null;
}

/** The logo file for a token-scoped logo route — 404 when there's none. */
export async function logoResponse(key: string | null | undefined): Promise<NextResponse> {
  if (!key) return new NextResponse(null, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(key);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFromKey(key),
      "Content-Length": String(data.length),
      // The page passes the logo's own ?v= version through, so a replaced logo
      // is a new URL; a short cache is safe and spares every visitor a refetch.
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
