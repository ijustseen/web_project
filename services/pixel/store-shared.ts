import type {
  PixelColor,
  PlacePixelRequest,
  PlacePixelResult,
  StoredPixel,
} from "../../types/pixel";
import { PIXEL_PALETTE } from "../../types/pixel";
import { COOLDOWN_SECONDS, BOARD_SIZE } from "./constants";
import { getRedisClient } from "./redis";

const REDIS_BOARD_KEY = "pixel:battle:board";
const REDIS_COOLDOWN_KEY = "pixel:battle:cooldown";

const COOLDOWN_SCRIPT = `
local cooldownKey = KEYS[1]
local playerId = ARGV[1]
local now = tonumber(ARGV[2])
local cooldownMs = tonumber(ARGV[3])

local nextAvailable = redis.call("HGET", cooldownKey, playerId)
if nextAvailable and tonumber(nextAvailable) > now then
  return {0, tonumber(nextAvailable)}
end

local newNextAvailable = now + cooldownMs
redis.call("HSET", cooldownKey, playerId, tostring(newNextAvailable))
return {1, newNextAvailable}
`;

export class SharedStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharedStoreUnavailableError";
  }
}

function isPixelColor(value: string): value is PixelColor {
  return PIXEL_PALETTE.includes(value as PixelColor);
}

function toBoardField(x: number, y: number): string {
  return `${x}:${y}`;
}

function parseBoardField(field: string): { x: number; y: number } | null {
  const [rawX, rawY] = field.split(":");
  if (!rawX || !rawY) {
    return null;
  }

  const x = Number.parseInt(rawX, 10);
  const y = Number.parseInt(rawY, 10);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null;
  }

  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
    return null;
  }

  return { x, y };
}

function getRequiredRedisClient() {
  const redis = getRedisClient();
  if (!redis) {
    throw new SharedStoreUnavailableError("Redis client is unavailable");
  }

  return redis;
}

export async function applyPlacementShared(
  input: PlacePixelRequest,
  nowMs: number = Date.now(),
): Promise<PlacePixelResult> {
  const redis = getRequiredRedisClient();

  try {
    const scriptResult = (await redis.eval(
      COOLDOWN_SCRIPT,
      1,
      REDIS_COOLDOWN_KEY,
      input.playerId,
      nowMs.toString(),
      (COOLDOWN_SECONDS * 1000).toString(),
    )) as [number, number];

    const [allowed, nextAvailableAt] = scriptResult;

    if (allowed !== 1) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((nextAvailableAt - nowMs) / 1000),
      );

      return {
        ok: false,
        code: "COOLDOWN",
        remainingSeconds,
      };
    }

    await redis.hset(
      REDIS_BOARD_KEY,
      toBoardField(input.x, input.y),
      input.color,
    );

    return {
      ok: true,
      nextAvailableAt,
    };
  } catch {
    throw new SharedStoreUnavailableError("Redis placement write failed");
  }
}

export async function getBoardSnapshotShared(): Promise<StoredPixel[]> {
  const redis = getRequiredRedisClient();

  try {
    const boardRecord = await redis.hgetall(REDIS_BOARD_KEY);
    const result: StoredPixel[] = [];

    for (const [field, color] of Object.entries(boardRecord)) {
      if (!isPixelColor(color)) {
        continue;
      }

      const coordinate = parseBoardField(field);
      if (!coordinate) {
        continue;
      }

      result.push({
        x: coordinate.x,
        y: coordinate.y,
        color,
      });
    }

    return result;
  } catch {
    throw new SharedStoreUnavailableError("Redis board read failed");
  }
}

export async function resetBoardToWhiteShared(): Promise<void> {
  const redis = getRequiredRedisClient();

  try {
    await redis.del(REDIS_BOARD_KEY);
  } catch {
    throw new SharedStoreUnavailableError("Redis board reset failed");
  }
}
