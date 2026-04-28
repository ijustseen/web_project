export type SelectedCell = {
  x: number;
  y: number;
};

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
