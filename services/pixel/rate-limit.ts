const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 12;

type Bucket = {
  count: number;
  windowStartedAt: number;
};

type BucketResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const playerBuckets = new Map<string, Bucket>();
const ipBuckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "RATE_LIMITED";
      reason: "TOO_MANY_REQUESTS";
      retryAfterSeconds: number;
    };

export function checkPlacementRateLimit(
  playerId: string,
  ipAddress: string,
  nowMs: number = Date.now(),
): RateLimitResult {
  const playerResult = consumeBucket(playerBuckets, playerId, nowMs);
  const ipResult = consumeBucket(ipBuckets, ipAddress, nowMs);

  if (playerResult.allowed && ipResult.allowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: "RATE_LIMITED",
    reason: "TOO_MANY_REQUESTS",
    retryAfterSeconds: Math.max(
      playerResult.retryAfterSeconds,
      ipResult.retryAfterSeconds,
    ),
  };
}

export function resetPlacementRateLimitStore(): void {
  playerBuckets.clear();
  ipBuckets.clear();
}

function consumeBucket(
  buckets: Map<string, Bucket>,
  key: string,
  nowMs: number,
): BucketResult {
  const current = buckets.get(key);
  if (!current || nowMs - current.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    buckets.set(key, {
      count: 1,
      windowStartedAt: nowMs,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs =
      RATE_LIMIT_WINDOW_MS - (nowMs - current.windowStartedAt);

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  current.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}
