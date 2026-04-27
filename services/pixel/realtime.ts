import type { PixelColor } from "../../types/pixel";

type RealtimeEvent =
  | { type: "ready" }
  | { type: "placed"; x: number; y: number; color: PixelColor }
  | { type: "reset" }
  | { type: "heartbeat" };

const encoder = new TextEncoder();
const clients = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

function encodeEvent(event: RealtimeEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerRealtimeClient(
  clientId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  clients.set(clientId, controller);
  controller.enqueue(encodeEvent({ type: "ready" }));
}

export function unregisterRealtimeClient(clientId: string): void {
  clients.delete(clientId);
}

export function sendRealtimeHeartbeat(clientId: string): void {
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

export function broadcastRealtimeEvent(
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
