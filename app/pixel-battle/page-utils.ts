"use client";

import { BOARD_SIZE } from "@/services/pixel/constants";

export const CANVAS_VIEW_SIZE = 512;

export type ViewState = {
  zoom: number;
  panX: number;
  panY: number;
};

export type PlaceResponse =
  | { ok: true; nextAvailableAt: number }
  | { ok: false; code: "COOLDOWN"; remainingSeconds: number }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; code: string; message?: string };

export function isCooldownResponse(
  value: PlaceResponse,
): value is { ok: false; code: "COOLDOWN"; remainingSeconds: number } {
  return (
    !value.ok &&
    value.code === "COOLDOWN" &&
    "remainingSeconds" in value &&
    typeof value.remainingSeconds === "number"
  );
}

export function isRateLimitedResponse(
  value: PlaceResponse,
): value is { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number } {
  return (
    !value.ok &&
    value.code === "RATE_LIMITED" &&
    "retryAfterSeconds" in value &&
    typeof value.retryAfterSeconds === "number"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function readJsonSafely(
  response: Response,
): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function toRgb(hexColor: string): [number, number, number] {
  const clean = hexColor.startsWith("#") ? hexColor.slice(1) : hexColor;
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [255, 255, 255];
  }

  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

export function getOrCreatePlayerId(storageKey: string): string {
  const persisted = window.localStorage.getItem(storageKey);
  if (persisted && /^[a-zA-Z0-9_-]{3,64}$/.test(persisted)) {
    return persisted;
  }

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replaceAll("-", "")
      : `player-${Date.now()}`;

  window.localStorage.setItem(storageKey, generated);
  return generated;
}

function getMinPan(zoom: number): number {
  return CANVAS_VIEW_SIZE - BOARD_SIZE * zoom;
}

export function clampViewState(viewState: ViewState): ViewState {
  const minPan = getMinPan(viewState.zoom);
  const maxPan = 0;

  return {
    ...viewState,
    panX: Math.min(maxPan, Math.max(minPan, viewState.panX)),
    panY: Math.min(maxPan, Math.max(minPan, viewState.panY)),
  };
}

export function getCanvasScale(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  return CANVAS_VIEW_SIZE / rect.width;
}
