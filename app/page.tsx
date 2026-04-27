"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BOARD_SIZE } from "@/services/pixel/constants";
import { PIXEL_PALETTE, type PixelColor } from "@/types/pixel";

import {
  createBoardState,
  getCellIndex,
  isPlaceActionDisabled,
} from "./pixel-battle/ui-state";
import styles from "./page.module.scss";

const DEFAULT_CELL_COLOR = "#ffffff";
const PLAYER_ID_STORAGE_KEY = "pixel-battle-player-id";
const CANVAS_VIEW_SIZE = 512;
const MIN_ZOOM = CANVAS_VIEW_SIZE / BOARD_SIZE;
const INITIAL_ZOOM = MIN_ZOOM;
const MAX_ZOOM = 16;
const ZOOM_STEP = 0.5;

type SelectedCell = {
  x: number;
  y: number;
};

type ViewState = {
  zoom: number;
  panX: number;
  panY: number;
};

type RealtimeStatus = "connecting" | "connected" | "disconnected";

type PanBounds = {
  minPanX: number;
  maxPanX: number;
  minPanY: number;
  maxPanY: number;
};

type PlaceResponse =
  | { ok: true; nextAvailableAt: number }
  | { ok: false; code: "COOLDOWN"; remainingSeconds: number }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; code: string; message?: string };

function isCooldownResponse(
  value: PlaceResponse,
): value is { ok: false; code: "COOLDOWN"; remainingSeconds: number } {
  return (
    !value.ok &&
    value.code === "COOLDOWN" &&
    "remainingSeconds" in value &&
    typeof value.remainingSeconds === "number"
  );
}

function isRateLimitedResponse(
  value: PlaceResponse,
): value is { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number } {
  return (
    !value.ok &&
    value.code === "RATE_LIMITED" &&
    "retryAfterSeconds" in value &&
    typeof value.retryAfterSeconds === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRgb(hexColor: string): [number, number, number] {
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

function getOrCreatePlayerId(): string {
  const persisted = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (persisted && /^[a-zA-Z0-9_-]{3,64}$/.test(persisted)) {
    return persisted;
  }

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replaceAll("-", "")
      : `player-${Date.now()}`;

  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, generated);
  return generated;
}

function getPanBounds(zoom: number): PanBounds {
  const renderedSize = BOARD_SIZE * zoom;
  const minPan = CANVAS_VIEW_SIZE - renderedSize;

  return {
    minPanX: minPan,
    maxPanX: 0,
    minPanY: minPan,
    maxPanY: 0,
  };
}

function clampViewState(viewState: ViewState): ViewState {
  const bounds = getPanBounds(viewState.zoom);

  return {
    ...viewState,
    panX: Math.min(bounds.maxPanX, Math.max(bounds.minPanX, viewState.panX)),
    panY: Math.min(bounds.maxPanY, Math.max(bounds.minPanY, viewState.panY)),
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerIdRef = useRef<string>("");
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const touchDragRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);

  const [board, setBoard] = useState<string[]>(() =>
    createBoardState(BOARD_SIZE, DEFAULT_CELL_COLOR),
  );
  const [selectedColor, setSelectedColor] = useState<PixelColor>(
    PIXEL_PALETTE[0],
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<SelectedCell | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Loading board...");
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("connecting");
  const [viewState, setViewState] = useState<ViewState>({
    zoom: INITIAL_ZOOM,
    panX: 0,
    panY: 0,
  });

  const updateBoard = useCallback((pixels: unknown[]) => {
    const nextBoard = createBoardState(BOARD_SIZE, DEFAULT_CELL_COLOR);

    for (const pixel of pixels) {
      if (!isRecord(pixel)) {
        continue;
      }

      const x = pixel.x;
      const y = pixel.y;
      const color = pixel.color;

      if (
        typeof x === "number" &&
        typeof y === "number" &&
        typeof color === "string" &&
        x >= 0 &&
        y >= 0 &&
        x < BOARD_SIZE &&
        y < BOARD_SIZE
      ) {
        nextBoard[getCellIndex(x, y, BOARD_SIZE)] = color;
      }
    }

    setBoard(nextBoard);
  }, []);

  const loadBoard = useCallback(async () => {
    try {
      const response = await fetch("/api/pixels/board", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load board");
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.pixels)) {
        throw new Error("Invalid board payload");
      }

      updateBoard(payload.pixels);
      setStatusMessage("Board synchronized.");
    } catch {
      setStatusMessage("Board loading failed. Try again.");
    } finally {
      setIsLoadingBoard(false);
    }
  }, [updateBoard]);

  const disablePlaceAction = useMemo(
    () =>
      isLoadingBoard ||
      isPlaceActionDisabled(
        cooldownRemaining,
        Boolean(selectedCell),
        isPlacing,
      ),
    [cooldownRemaining, isLoadingBoard, selectedCell, isPlacing],
  );

  useEffect(() => {
    playerIdRef.current = getOrCreatePlayerId();

    const timerId = window.setTimeout(() => {
      void loadBoard();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadBoard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (cooldownUntil <= 0) {
        setCooldownRemaining(0);
        return;
      }

      const remaining = Math.max(
        0,
        Math.ceil((cooldownUntil - Date.now()) / 1000),
      );
      setCooldownRemaining(remaining);
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [cooldownUntil]);

  useEffect(() => {
    const eventSource = new EventSource("/api/pixels/stream");

    eventSource.onopen = () => {
      setRealtimeStatus("connected");
    };

    eventSource.onmessage = (event) => {
      let payload: unknown;

      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!isRecord(payload) || typeof payload.type !== "string") {
        return;
      }

      if (payload.type === "placed") {
        const x = payload.x;
        const y = payload.y;
        const color = payload.color;

        if (
          typeof x === "number" &&
          typeof y === "number" &&
          typeof color === "string" &&
          x >= 0 &&
          y >= 0 &&
          x < BOARD_SIZE &&
          y < BOARD_SIZE
        ) {
          setBoard((previous) => {
            const next = [...previous];
            next[getCellIndex(x, y, BOARD_SIZE)] = color;
            return next;
          });
        }

        return;
      }

      if (payload.type === "reset") {
        setBoard(createBoardState(BOARD_SIZE, DEFAULT_CELL_COLOR));
        setStatusMessage("Board was reset to white.");
      }
    };

    eventSource.onerror = () => {
      setRealtimeStatus("disconnected");
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (!sourceCanvasRef.current) {
      sourceCanvasRef.current = document.createElement("canvas");
      sourceCanvasRef.current.width = BOARD_SIZE;
      sourceCanvasRef.current.height = BOARD_SIZE;
    }

    const sourceCanvas = sourceCanvasRef.current;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) {
      return;
    }

    const imageData = sourceContext.createImageData(BOARD_SIZE, BOARD_SIZE);
    const data = imageData.data;

    for (let i = 0; i < board.length; i += 1) {
      const [red, green, blue] = toRgb(board[i]);
      const offset = i * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }

    sourceContext.putImageData(imageData, 0, 0);

    context.save();
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      sourceCanvas,
      viewState.panX,
      viewState.panY,
      BOARD_SIZE * viewState.zoom,
      BOARD_SIZE * viewState.zoom,
    );

    if (hoveredCell) {
      context.strokeStyle = "#9f87ff";
      context.lineWidth = 1.5;
      context.strokeRect(
        viewState.panX + hoveredCell.x * viewState.zoom,
        viewState.panY + hoveredCell.y * viewState.zoom,
        viewState.zoom,
        viewState.zoom,
      );
    }

    if (selectedCell) {
      context.strokeStyle = "#111111";
      context.lineWidth = 2;
      context.strokeRect(
        viewState.panX + selectedCell.x * viewState.zoom,
        viewState.panY + selectedCell.y * viewState.zoom,
        viewState.zoom,
        viewState.zoom,
      );
    }

    context.restore();
  }, [board, hoveredCell, selectedCell, viewState]);

  const readCellFromPointer = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ): SelectedCell | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaledX =
      ((event.clientX - rect.left) * CANVAS_VIEW_SIZE) / rect.width;
    const scaledY =
      ((event.clientY - rect.top) * CANVAS_VIEW_SIZE) / rect.height;
    const x = Math.floor((scaledX - viewState.panX) / viewState.zoom);
    const y = Math.floor((scaledY - viewState.panY) / viewState.zoom);

    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
      return null;
    }

    return { x, y };
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }

    if (isLoadingBoard) {
      return;
    }

    const nextCell = readCellFromPointer(event);
    if (!nextCell) {
      return;
    }

    setSelectedCell(nextCell);
    setStatusMessage(`Selected cell ${nextCell.x}:${nextCell.y}`);
  };

  const handlePlacePixel = async () => {
    if (!selectedCell || disablePlaceAction) {
      return;
    }

    setIsPlacing(true);

    try {
      const response = await fetch("/api/pixels/place", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-player-id": playerIdRef.current,
        },
        body: JSON.stringify({
          x: selectedCell.x,
          y: selectedCell.y,
          color: selectedColor,
        }),
      });

      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        setStatusMessage("Unexpected server response.");
        return;
      }

      const placeResult = payload as PlaceResponse;

      if (response.status === 429 && isCooldownResponse(placeResult)) {
        const nextTime = Date.now() + placeResult.remainingSeconds * 1000;
        setCooldownUntil(nextTime);
        setStatusMessage(`Cooldown: ${placeResult.remainingSeconds}s`);
        return;
      }

      if (response.status === 429 && isRateLimitedResponse(placeResult)) {
        setStatusMessage(
          `Rate limited: retry in ${placeResult.retryAfterSeconds}s`,
        );
        return;
      }

      if (!response.ok || !placeResult.ok) {
        const message =
          !placeResult.ok &&
          "message" in placeResult &&
          typeof placeResult.message === "string"
            ? placeResult.message
            : "Placement rejected.";

        setStatusMessage(message);
        return;
      }

      setCooldownUntil(placeResult.nextAvailableAt);
      setBoard((previous) => {
        const next = [...previous];
        next[getCellIndex(selectedCell.x, selectedCell.y, BOARD_SIZE)] =
          selectedColor;
        return next;
      });
      setStatusMessage(
        `Placed ${selectedColor} at ${selectedCell.x}:${selectedCell.y}`,
      );
    } catch {
      setStatusMessage("Network error while placing pixel.");
    } finally {
      setIsPlacing(false);
    }
  };

  const handleZoomSliderChange = (nextZoom: number) => {
    setViewState((previous) => {
      const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const center = CANVAS_VIEW_SIZE / 2;
      const worldX = (center - previous.panX) / previous.zoom;
      const worldY = (center - previous.panY) / previous.zoom;

      return clampViewState({
        zoom: clampedZoom,
        panX: center - worldX * clampedZoom,
        panY: center - worldY * clampedZoom,
      });
    });
  };

  const handleDragStart = (event: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    dragMovedRef.current = false;
    setIsDragging(true);
  };

  const handleDragMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const hovered = readCellFromPointer(event);
    setHoveredCell(hovered);

    if (!dragRef.current) {
      return;
    }

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_VIEW_SIZE / rect.width;

    const deltaX = (event.clientX - dragRef.current.x) * scale;
    const deltaY = (event.clientY - dragRef.current.y) * scale;

    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
      dragMovedRef.current = true;
    }

    dragRef.current = { x: event.clientX, y: event.clientY };

    setViewState((previous) =>
      clampViewState({
        ...previous,
        panX: previous.panX + deltaX,
        panY: previous.panY + deltaY,
      }),
    );
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    touchDragRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchDragRef.current || event.touches.length !== 1) {
      return;
    }

    event.preventDefault();

    const touch = event.touches[0];
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = CANVAS_VIEW_SIZE / rect.width;

    const deltaX = (touch.clientX - touchDragRef.current.x) * scale;
    const deltaY = (touch.clientY - touchDragRef.current.y) * scale;

    touchDragRef.current = { x: touch.clientX, y: touch.clientY };

    setViewState((previous) =>
      clampViewState({
        ...previous,
        panX: previous.panX + deltaX,
        panY: previous.panY + deltaY,
      }),
    );
  };

  const handleTouchEnd = () => {
    touchDragRef.current = null;
    setIsDragging(false);
  };

  const handleCanvasLeave = () => {
    handleDragEnd();
    setHoveredCell(null);
  };

  const handleCanvasWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX =
      ((event.clientX - rect.left) * CANVAS_VIEW_SIZE) / rect.width;
    const pointerY =
      ((event.clientY - rect.top) * CANVAS_VIEW_SIZE) / rect.height;

    setViewState((previous) => {
      const zoomDelta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, previous.zoom + zoomDelta),
      );

      const worldX = (pointerX - previous.panX) / previous.zoom;
      const worldY = (pointerY - previous.panY) / previous.zoom;

      const nextPanX = pointerX - worldX * nextZoom;
      const nextPanY = pointerY - worldY * nextZoom;

      return clampViewState({
        zoom: nextZoom,
        panX: nextPanX,
        panY: nextPanY,
      });
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>
          Pixel Battle {BOARD_SIZE}x{BOARD_SIZE}
        </h1>
        <p>Global board, one pixel every 10 seconds.</p>
      </header>

      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <section className={`${styles.sectionCard} ${styles.paletteCard}`}>
            <h2>Palette</h2>
            <div className={styles.paletteGrid}>
              {PIXEL_PALETTE.map((color) => {
                const isSelected = color === selectedColor;

                return (
                  <button
                    key={color}
                    type="button"
                    className={styles.paletteSwatch}
                    style={{ backgroundColor: color }}
                    data-selected={isSelected}
                    onClick={() => setSelectedColor(color)}
                    aria-label={`Select color ${color}`}
                  />
                );
              })}
            </div>
          </section>

          <section className={`${styles.sectionCard} ${styles.selectionCard}`}>
            <div className={styles.selectionHeader}>
              <h2>Selection</h2>
              <span className={styles.liveBadge} data-state={realtimeStatus}>
                {realtimeStatus}
              </span>
            </div>
            <div className={styles.mobilePalette}>
              {PIXEL_PALETTE.map((color) => {
                const isSelected = color === selectedColor;

                return (
                  <button
                    key={`mobile-${color}`}
                    type="button"
                    className={styles.paletteSwatch}
                    style={{ backgroundColor: color }}
                    data-selected={isSelected}
                    onClick={() => setSelectedColor(color)}
                    aria-label={`Select color ${color}`}
                  />
                );
              })}
            </div>
            <p>
              {selectedCell
                ? `X: ${selectedCell.x}, Y: ${selectedCell.y}`
                : "Click board to choose a cell"}
            </p>
            <p>Cooldown: {cooldownRemaining}s</p>
            <button
              type="button"
              className={styles.placeButton}
              onClick={handlePlacePixel}
              disabled={disablePlaceAction}
            >
              {isPlacing ? "Placing..." : "Place pixel"}
            </button>
            <p className={styles.statusMessage} aria-live="polite">
              {statusMessage}
            </p>
          </section>
        </aside>

        <section className={styles.boardSection}>
          <div className={styles.zoomSliderWrap}>
            <label htmlFor="zoom-slider">Zoom</label>
            <input
              id="zoom-slider"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.1}
              value={viewState.zoom}
              onChange={(event) =>
                handleZoomSliderChange(Number(event.target.value))
              }
            />
          </div>
          <canvas
            ref={canvasRef}
            width={CANVAS_VIEW_SIZE}
            height={CANVAS_VIEW_SIZE}
            className={`${styles.boardCanvas} ${isDragging ? styles.dragging : ""}`}
            onClick={handleCanvasClick}
            onWheel={handleCanvasWheel}
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleCanvasLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            aria-label="Pixel battle board"
            role="img"
          />
          <p className={styles.boardHint}>
            Tap to select. Drag with mouse to move camera. Use zoom slider or
            mouse wheel.
          </p>
        </section>
      </main>
    </div>
  );
}
