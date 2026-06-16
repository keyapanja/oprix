// App base URL for deep links handed to the extension (task/KB pages). Defaults
// to the local dev server; set APP_URL to the live domain in production.
export function appBaseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

// Only allow the connect flow to hand a token back to a Chrome identity redirect
// (https://<extension-id>.chromiumapp.org/...). Guards against open-redirect /
// token leak to arbitrary sites.
export function isExtensionRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" && u.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}
