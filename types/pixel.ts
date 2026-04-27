export const PIXEL_PALETTE = [
  "#111111",
  "#f8fafc",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#06b6d4",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
] as const;

export type PixelColor = (typeof PIXEL_PALETTE)[number];

export type PlacePixelRequest = {
  playerId: string;
  x: number;
  y: number;
  color: PixelColor;
};

export type PlacePixelResult =
  | { ok: true; nextAvailableAt: number }
  | { ok: false; code: "COOLDOWN"; remainingSeconds: number }
  | { ok: false; code: "VALIDATION"; message: string }
  | { ok: false; code: "UNAUTHORIZED" };
