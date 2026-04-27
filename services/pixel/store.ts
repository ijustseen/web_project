import { BOARD_SIZE, COOLDOWN_SECONDS } from "./constants";
import { validateColor, validateCoordinates } from "./validation";
import type {
  PixelColor,
  PlacePixelRequest,
  PlacePixelResult,
} from "../../types/pixel";

const board = new Map<number, PixelColor>();
const nextPlacementByPlayer = new Map<string, number>();

export type StoredPixel = {
  x: number;
  y: number;
  color: PixelColor;
};

function toIndex(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

function fromIndex(index: number): { x: number; y: number } {
  const y = Math.floor(index / BOARD_SIZE);
  const x = index % BOARD_SIZE;
  return { x, y };
}

export function applyPlacement(
  input: PlacePixelRequest,
  nowMs: number = Date.now(),
): PlacePixelResult {
  const coordinateResult = validateCoordinates(input.x, input.y);
  if (!coordinateResult.ok) {
    return {
      ok: false,
      code: "VALIDATION",
      message: coordinateResult.message,
    };
  }

  const colorResult = validateColor(input.color);
  if (!colorResult.ok) {
    return {
      ok: false,
      code: "VALIDATION",
      message: colorResult.message,
    };
  }

  const nextAvailableAt = nextPlacementByPlayer.get(input.playerId);
  if (nextAvailableAt && nextAvailableAt > nowMs) {
    const remainingMs = nextAvailableAt - nowMs;
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    return {
      ok: false,
      code: "COOLDOWN",
      remainingSeconds,
    };
  }

  const index = toIndex(coordinateResult.value.x, coordinateResult.value.y);
  board.set(index, colorResult.value);

  const updatedNextAvailableAt = nowMs + COOLDOWN_SECONDS * 1000;
  nextPlacementByPlayer.set(input.playerId, updatedNextAvailableAt);

  return {
    ok: true,
    nextAvailableAt: updatedNextAvailableAt,
  };
}

export function getPixelColor(x: number, y: number): PixelColor | null {
  const coordinateResult = validateCoordinates(x, y);
  if (!coordinateResult.ok) {
    return null;
  }

  const index = toIndex(coordinateResult.value.x, coordinateResult.value.y);
  return board.get(index) ?? null;
}

export function getPlayerNextAvailableAt(playerId: string): number | null {
  return nextPlacementByPlayer.get(playerId) ?? null;
}

export function getBoardSnapshot(): StoredPixel[] {
  const snapshot: StoredPixel[] = [];

  for (const [index, color] of board) {
    const coordinate = fromIndex(index);
    snapshot.push({
      x: coordinate.x,
      y: coordinate.y,
      color,
    });
  }

  return snapshot;
}

export function resetBoardToWhite(): void {
  board.clear();
}

export function resetPixelStore(): void {
  board.clear();
  nextPlacementByPlayer.clear();
}
