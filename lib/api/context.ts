import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Who an API (MCP) call is acting as, for the length of that one call.
 *
 * The API doesn't get its own rules. While a tool runs, getSession() returns
 * the connection's client login (marked via: "api"), so the portal's own
 * functions — requirePortalAction(), the clientId in every WHERE — apply
 * exactly as they do in the browser. The only extra limits are the
 * connection's: read-only, and which projects it may touch.
 */
export type ApiCall = {
  session: SessionUser & { via: "api"; clientId: string };
  connection: {
    id: string;
    name: string;
    canWrite: boolean;
    /** Empty = every project of the client. */
    projectIds: string[];
  };
  ip: string | null;
};

const store = new AsyncLocalStorage<ApiCall>();

export function runAsApi<T>(call: ApiCall, fn: () => Promise<T>): Promise<T> {
  return store.run(call, fn);
}

/** The API call in progress, if this code is running inside one. */
export function apiCall(): ApiCall | undefined {
  return store.getStore();
}
