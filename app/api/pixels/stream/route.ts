import {
  registerRealtimeClient,
  sendRealtimeHeartbeat,
  unregisterRealtimeClient,
} from "@/services/pixel/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clientId = crypto.randomUUID();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) {
      return;
    }

    closed = true;

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    unregisterRealtimeClient(clientId);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      registerRealtimeClient(clientId, controller);

      heartbeatTimer = setInterval(() => {
        sendRealtimeHeartbeat(clientId);
      }, 15_000);

      request.signal.addEventListener(
        "abort",
        () => {
          cleanup();
          try {
            controller.close();
          } catch {}
        },
        { once: true },
      );
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
