import type { PixelColor } from "../../types/pixel";
import { getRedisClient, getRedisSubscriber, isRedisConfigured } from "./redis";

type RealtimeEvent =
  | { type: "ready" }
  | { type: "placed"; x: number; y: number; color: PixelColor }
  | { type: "reset" }
  | { type: "heartbeat" };

const REDIS_REALTIME_CHANNEL = "pixel:battle:events";

const encoder = new TextEncoder();
const clients = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
let subscriptionInitialized = false;
let redisListenersBound = false;

function encodeEvent(event: RealtimeEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerRealtimeClient(
  clientId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  void initializeRedisSubscription();
  clients.set(clientId, controller);
  controller.enqueue(encodeEvent({ type: "ready" }));
}

export function unregisterRealtimeClient(clientId: string): void {
  clients.delete(clientId);
}

export function sendRealtimeHeartbeat(clientId: string): void {
  void initializeRedisSubscription();

  const controller = clients.get(clientId);
  if (!controller) {
    return;
  }

  try {
    controller.enqueue(encodeEvent({ type: "heartbeat" }));
  } catch {
    clients.delete(clientId);
  }
}

export async function publishRealtimeEvent(
  event: Exclude<RealtimeEvent, { type: "ready" }>,
): Promise<void> {
  await initializeRedisSubscription();

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.publish(REDIS_REALTIME_CHANNEL, JSON.stringify(event));
      return;
    } catch {
      // If Redis publish fails, fallback to local process broadcast.
    }
  }

  broadcastLocalEvent(event);
}

function broadcastLocalEvent(
  event: Exclude<RealtimeEvent, { type: "ready" }>,
): void {
  const payload = encodeEvent(event);

  for (const [clientId, controller] of clients) {
    try {
      controller.enqueue(payload);
    } catch {
      clients.delete(clientId);
    }
  }
}

async function initializeRedisSubscription(): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }

  const subscriber = getRedisSubscriber();
  if (!subscriber) {
    return;
  }

  bindRedisSubscriberListeners(subscriber);
  await subscribeToRealtimeChannel(subscriber);
}

function bindRedisSubscriberListeners(
  subscriber: NonNullable<ReturnType<typeof getRedisSubscriber>>,
): void {
  if (redisListenersBound) {
    return;
  }

  redisListenersBound = true;

  subscriber.on("ready", () => {
    void subscribeToRealtimeChannel(subscriber);
  });

  subscriber.on("close", () => {
    subscriptionInitialized = false;
  });

  subscriber.on("end", () => {
    subscriptionInitialized = false;
  });

  subscriber.on("reconnecting", () => {
    subscriptionInitialized = false;
  });

  subscriber.on("message", (channel, message) => {
    if (channel !== REDIS_REALTIME_CHANNEL) {
      return;
    }

    let event: unknown;
    try {
      event = JSON.parse(message);
    } catch {
      return;
    }

    if (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      typeof event.type === "string" &&
      event.type !== "ready"
    ) {
      broadcastLocalEvent(event as Exclude<RealtimeEvent, { type: "ready" }>);
    }
  });
}

async function subscribeToRealtimeChannel(
  subscriber: NonNullable<ReturnType<typeof getRedisSubscriber>>,
): Promise<void> {
  if (subscriptionInitialized) {
    return;
  }

  try {
    await subscriber.subscribe(REDIS_REALTIME_CHANNEL);
    subscriptionInitialized = true;
  } catch {
    subscriptionInitialized = false;
  }
}
