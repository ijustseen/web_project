import Redis from "ioredis";

type RedisWithEvents = Redis;

declare global {
  var __pixelRedisClient: RedisWithEvents | undefined;
  var __pixelRedisSubscriber: RedisWithEvents | undefined;
}

function createRedisConnection(): RedisWithEvents | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  return new Redis(redisUrl, {
    connectTimeout: 4_000,
    commandTimeout: 4_000,
    // Fail fast for API read/write commands to avoid hanging requests.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

function createRedisSubscriberConnection(): RedisWithEvents | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  return new Redis(redisUrl, {
    connectTimeout: 4_000,
    commandTimeout: 4_000,
    // Subscriber should keep reconnecting for realtime delivery.
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
  });
}

function attachRedisErrorHandler(client: RedisWithEvents): RedisWithEvents {
  client.on("error", () => {
    // Errors are handled by callers via command failures and availability checks.
  });

  return client;
}

export function isRedisConfigured(): boolean {
  return (
    typeof process.env.REDIS_URL === "string" &&
    process.env.REDIS_URL.length > 0
  );
}

export function getRedisClient(): RedisWithEvents | null {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!globalThis.__pixelRedisClient) {
    const client = createRedisConnection();
    globalThis.__pixelRedisClient = client
      ? attachRedisErrorHandler(client)
      : undefined;
  }

  return globalThis.__pixelRedisClient ?? null;
}

export function getRedisSubscriber(): RedisWithEvents | null {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!globalThis.__pixelRedisSubscriber) {
    const subscriber = createRedisSubscriberConnection();
    globalThis.__pixelRedisSubscriber = subscriber
      ? attachRedisErrorHandler(subscriber)
      : undefined;
  }

  return globalThis.__pixelRedisSubscriber ?? null;
}
