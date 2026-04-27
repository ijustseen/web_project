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
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
  });
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
    globalThis.__pixelRedisClient = createRedisConnection() ?? undefined;
  }

  return globalThis.__pixelRedisClient ?? null;
}

export function getRedisSubscriber(): RedisWithEvents | null {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!globalThis.__pixelRedisSubscriber) {
    globalThis.__pixelRedisSubscriber = createRedisConnection() ?? undefined;
  }

  return globalThis.__pixelRedisSubscriber ?? null;
}
