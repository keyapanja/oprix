import "server-only";

// Fixed-window counters held in process memory. Single host, so this is enough
// to blunt abuse of the unauthenticated auth routes (guessing, mail-bombing);
// it resets on restart and doesn't span instances. Move to Redis if the app
// ever runs more than one container.

type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Bucket>();
/** Sweep expired keys once the map is big enough to be worth walking. */
const SWEEP_AT = 5_000;

function sweep(now: number): void {
  for (const [key, bucket] of BUCKETS) {
    if (now > bucket.resetAt) BUCKETS.delete(key);
  }
}

/**
 * Count one hit against `key` and report whether it's over the limit.
 * Returns false for the first `max` hits inside `windowMs`, true after.
 */
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (BUCKETS.size > SWEEP_AT) sweep(now);

  const bucket = BUCKETS.get(key);
  if (!bucket || now > bucket.resetAt) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

/** Best-effort caller IP from the proxy headers; "unknown" behind a bad proxy. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
