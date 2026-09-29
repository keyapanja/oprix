import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

/**
 * Identifies the running build. Next writes `.next/BUILD_ID` at build time and
 * the Docker image copies `.next` verbatim, so this value is stable for the life
 * of a deployment and different in the next one.
 *
 * That's what lets a browser tell "the server blipped" from "the server has been
 * replaced": the page is rendered with this id, and /api/health reports the id
 * of whoever answers. A mismatch means the tab is running code the server no
 * longer serves.
 *
 * Read once per process. The fallback (dev, where there's no BUILD_ID file)
 * still changes whenever the server restarts, which is the same signal.
 */
export const BUILD_ID: string = (() => {
  try {
    return readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || randomUUID();
  } catch {
    return randomUUID();
  }
})();
