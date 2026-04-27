import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  PixelColor,
  PlacePixelRequest,
  PlacePixelResult,
} from "../../types/pixel";
import { PIXEL_PALETTE } from "../../types/pixel";
import { COOLDOWN_SECONDS, BOARD_SIZE } from "./constants";
import { getRedisClient, isRedisConfigured } from "./redis";
import { type StoredPixel } from "./store";

const REDIS_BOARD_KEY = "pixel:battle:board";
const REDIS_COOLDOWN_KEY = "pixel:battle:cooldown";
const LOCAL_STATE_FILE = path.join(
  os.tmpdir(),
  "pixel-battle-shared-state.json",
);
const LOCAL_STATE_LOCK_FILE = path.join(
  os.tmpdir(),
  "pixel-battle-shared-state.lock",
);

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

type LocalSharedState = {
  board: Record<string, PixelColor>;
  cooldown: Record<string, number>;
};

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

function createDefaultLocalState(): LocalSharedState {
  return {
    board: {},
    cooldown: {},
  };
}

async function readLocalState(): Promise<LocalSharedState> {
  try {
    const content = await fs.readFile(LOCAL_STATE_FILE, "utf8");
    const parsed: unknown = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      return createDefaultLocalState();
    }

    const candidate = parsed as Record<string, unknown>;
    const board =
      candidate.board && typeof candidate.board === "object"
        ? (candidate.board as Record<string, string>)
        : {};
    const cooldown =
      candidate.cooldown && typeof candidate.cooldown === "object"
        ? (candidate.cooldown as Record<string, unknown>)
        : {};

    const normalizedBoard: Record<string, PixelColor> = {};
    for (const [field, color] of Object.entries(board)) {
      if (typeof color !== "string" || !isPixelColor(color)) {
        continue;
      }

      const coordinate = parseBoardField(field);
      if (!coordinate) {
        continue;
      }

      normalizedBoard[field] = color;
    }

    const normalizedCooldown: Record<string, number> = {};
    for (const [playerId, nextAvailableAt] of Object.entries(cooldown)) {
      if (
        typeof nextAvailableAt === "number" &&
        Number.isFinite(nextAvailableAt) &&
        nextAvailableAt > 0
      ) {
        normalizedCooldown[playerId] = nextAvailableAt;
      }
    }

    return {
      board: normalizedBoard,
      cooldown: normalizedCooldown,
    };
  } catch {
    return createDefaultLocalState();
  }
}

async function writeLocalState(state: LocalSharedState): Promise<void> {
  await fs.writeFile(LOCAL_STATE_FILE, JSON.stringify(state), "utf8");
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withLocalStateLock<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null;

    try {
      lockHandle = await fs.open(LOCAL_STATE_LOCK_FILE, "wx");
      const result = await operation();
      await lockHandle.close();
      await fs.unlink(LOCAL_STATE_LOCK_FILE).catch(() => {});
      return result;
    } catch {
      if (lockHandle) {
        await lockHandle.close().catch(() => {});
        await fs.unlink(LOCAL_STATE_LOCK_FILE).catch(() => {});
      }

      await delay(10);
    }
  }

  return operation();
}

async function applyPlacementLocalShared(
  input: PlacePixelRequest,
  nowMs: number,
): Promise<PlacePixelResult> {
  return withLocalStateLock(async () => {
    const state = await readLocalState();

    const nextAvailableAt = state.cooldown[input.playerId] ?? 0;
    if (nextAvailableAt > nowMs) {
      return {
        ok: false,
        code: "COOLDOWN",
        remainingSeconds: Math.max(
          1,
          Math.ceil((nextAvailableAt - nowMs) / 1000),
        ),
      };
    }

    const updatedNextAvailableAt = nowMs + COOLDOWN_SECONDS * 1000;
    state.cooldown[input.playerId] = updatedNextAvailableAt;
    state.board[toBoardField(input.x, input.y)] = input.color;

    await writeLocalState(state);

    return {
      ok: true,
      nextAvailableAt: updatedNextAvailableAt,
    };
  });
}

async function getBoardSnapshotLocalShared(): Promise<StoredPixel[]> {
  const state = await readLocalState();
  const pixels: StoredPixel[] = [];

  for (const [field, color] of Object.entries(state.board)) {
    if (!isPixelColor(color)) {
      continue;
    }

    const coordinate = parseBoardField(field);
    if (!coordinate) {
      continue;
    }

    pixels.push({
      x: coordinate.x,
      y: coordinate.y,
      color,
    });
  }

  return pixels;
}

async function resetBoardToWhiteLocalShared(): Promise<void> {
  await withLocalStateLock(async () => {
    const state = await readLocalState();
    state.board = {};
    await writeLocalState(state);
  });
}

export async function applyPlacementShared(
  input: PlacePixelRequest,
  nowMs: number = Date.now(),
): Promise<PlacePixelResult> {
  if (!isRedisConfigured()) {
    return applyPlacementLocalShared(input, nowMs);
  }

  const redis = getRedisClient();
  if (!redis) {
    return applyPlacementLocalShared(input, nowMs);
  }

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
    return applyPlacementLocalShared(input, nowMs);
  }
}

export async function getBoardSnapshotShared(): Promise<StoredPixel[]> {
  if (!isRedisConfigured()) {
    return getBoardSnapshotLocalShared();
  }

  const redis = getRedisClient();
  if (!redis) {
    return getBoardSnapshotLocalShared();
  }

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
    return getBoardSnapshotLocalShared();
  }
}

export async function resetBoardToWhiteShared(): Promise<void> {
  if (!isRedisConfigured()) {
    await resetBoardToWhiteLocalShared();
    return;
  }

  const redis = getRedisClient();
  if (!redis) {
    await resetBoardToWhiteLocalShared();
    return;
  }

  try {
    await redis.del(REDIS_BOARD_KEY);
  } catch {
    await resetBoardToWhiteLocalShared();
  }
}
