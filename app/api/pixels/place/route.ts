import { NextResponse } from "next/server";

import {
  buildUnauthorizedError,
  readPlayerId,
} from "@/services/pixel/player-id";
import { logPlacementEvent } from "@/services/pixel/logging";
import { checkPlacementRateLimit } from "@/services/pixel/rate-limit";
import { publishRealtimeEvent } from "@/services/pixel/realtime";
import {
  applyPlacementShared,
  SharedStoreUnavailableError,
} from "@/services/pixel/store-shared";
import {
  validateColor,
  validateCoordinates,
} from "@/services/pixel/validation";

type PlacementPayload = {
  x: unknown;
  y: unknown;
  color: unknown;
};

export async function POST(request: Request) {
  const ipAddress = readIpAddress(request);
  const playerId = readPlayerId(request);
  if (!playerId) {
    logPlacementEvent({
      event: "pixel_placement",
      timestamp: Date.now(),
      playerId: null,
      ipAddress,
      status: 401,
      result: "unauthorized",
      x: null,
      y: null,
      color: null,
      details: "player identifier is missing",
    });

    return NextResponse.json(buildUnauthorizedError(), { status: 401 });
  }

  const rateLimit = checkPlacementRateLimit(playerId, ipAddress);
  if (!rateLimit.allowed) {
    logPlacementEvent({
      event: "pixel_placement",
      timestamp: Date.now(),
      playerId,
      ipAddress,
      status: 429,
      result: "rate_limited",
      x: null,
      y: null,
      color: null,
      details: `retry after ${rateLimit.retryAfterSeconds}s`,
    });

    return NextResponse.json(rateLimit, { status: 429 });
  }

  const payload = await readPlacementPayload(request);
  if (!payload) {
    logPlacementEvent({
      event: "pixel_placement",
      timestamp: Date.now(),
      playerId,
      ipAddress,
      status: 400,
      result: "validation_failed",
      x: null,
      y: null,
      color: null,
      details: "request body is invalid",
    });

    return NextResponse.json(
      {
        code: "VALIDATION",
        message: "Request body must contain x, y and color.",
      },
      { status: 400 },
    );
  }

  const coordinates = validateCoordinates(payload.x, payload.y);
  if (!coordinates.ok) {
    logPlacementEvent({
      event: "pixel_placement",
      timestamp: Date.now(),
      playerId,
      ipAddress,
      status: 400,
      result: "validation_failed",
      x: typeof payload.x === "number" ? payload.x : null,
      y: typeof payload.y === "number" ? payload.y : null,
      color: typeof payload.color === "string" ? payload.color : null,
      details: coordinates.code,
    });

    return NextResponse.json(coordinates, { status: 400 });
  }

  const color = validateColor(payload.color);
  if (!color.ok) {
    logPlacementEvent({
      event: "pixel_placement",
      timestamp: Date.now(),
      playerId,
      ipAddress,
      status: 400,
      result: "validation_failed",
      x: coordinates.value.x,
      y: coordinates.value.y,
      color: typeof payload.color === "string" ? payload.color : null,
      details: color.code,
    });

    return NextResponse.json(color, { status: 400 });
  }

  let result;

  try {
    result = await applyPlacementShared({
      playerId,
      x: coordinates.value.x,
      y: coordinates.value.y,
      color: color.value,
    });
  } catch (error) {
    if (error instanceof SharedStoreUnavailableError) {
      logPlacementEvent({
        event: "pixel_placement",
        timestamp: Date.now(),
        playerId,
        ipAddress,
        status: 503,
        result: "store_unavailable",
        x: coordinates.value.x,
        y: coordinates.value.y,
        color: color.value,
        details: "shared store unavailable",
      });

      return NextResponse.json(
        {
          code: "STORE_UNAVAILABLE",
          message: "Shared store is temporarily unavailable.",
        },
        { status: 503 },
      );
    }

    throw error;
  }

  if (!result.ok && result.code === "COOLDOWN") {
    logPlacementEvent({
      event: "pixel_placement",
      timestamp: Date.now(),
      playerId,
      ipAddress,
      status: 429,
      result: "cooldown",
      x: coordinates.value.x,
      y: coordinates.value.y,
      color: color.value,
      details: `remaining ${result.remainingSeconds}s`,
    });

    return NextResponse.json(result, { status: 429 });
  }

  if (!result.ok) {
    logPlacementEvent({
      event: "pixel_placement",
      timestamp: Date.now(),
      playerId,
      ipAddress,
      status: 400,
      result: "validation_failed",
      x: coordinates.value.x,
      y: coordinates.value.y,
      color: color.value,
      details: "generic validation",
    });

    return NextResponse.json(result, { status: 400 });
  }

  logPlacementEvent({
    event: "pixel_placement",
    timestamp: Date.now(),
    playerId,
    ipAddress,
    status: 200,
    result: "accepted",
    x: coordinates.value.x,
    y: coordinates.value.y,
    color: color.value,
    details: `next available at ${result.nextAvailableAt}`,
  });

  await publishRealtimeEvent({
    type: "placed",
    x: coordinates.value.x,
    y: coordinates.value.y,
    color: color.value,
  });

  return NextResponse.json(result, { status: 200 });
}

function readIpAddress(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "0.0.0.0";
}

async function readPlacementPayload(
  request: Request,
): Promise<PlacementPayload | null> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (!body || typeof body !== "object") {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  return {
    x: candidate.x,
    y: candidate.y,
    color: candidate.color,
  };
}
