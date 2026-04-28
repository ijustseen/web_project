"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BOARD_SIZE } from "@/services/pixel/constants";
import { PIXEL_PALETTE, type PixelColor } from "@/types/pixel";

import {
  CANVAS_VIEW_SIZE,
  clampViewState,
  getCanvasScale,
  getOrCreatePlayerId,
  isCooldownResponse,
  isRateLimitedResponse,
  isRecord,
  readJsonSafely,
  toRgb,
  type PlaceResponse,
  type ViewState,
} from "./pixel-battle/page-utils";
import {
  createBoardState,
  getCellIndex,
  isPlaceActionDisabled,
} from "./pixel-battle/ui-state";
import { BoardSection } from "./pixel-battle/components/BoardSection";
import { InfoCard } from "./pixel-battle/components/InfoCard";
import { PaletteCard } from "./pixel-battle/components/PaletteCard";
import { SelectionCard } from "./pixel-battle/components/SelectionCard";
import styles from "./page.module.scss";

const DEFAULT_CELL_COLOR = "#ffffff";
const PLAYER_ID_STORAGE_KEY = "pixel-battle-player-id";
const MIN_ZOOM = CANVAS_VIEW_SIZE / BOARD_SIZE;
const INITIAL_ZOOM = MIN_ZOOM;
const MAX_ZOOM = 16;
const ZOOM_STEP = 0.5;

type SelectedCell = {
  x: number;
  y: number;
};

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
  const [isMapDisabled, setIsMapDisabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [viewState, setViewState] = useState<ViewState>({
    zoom: INITIAL_ZOOM,
    panX: 0,
    panY: 0,
  });

  const addPanDelta = useCallback((deltaX: number, deltaY: number) => {
    setViewState((previous) =>
      clampViewState({
        ...previous,
        panX: previous.panX + deltaX,
        panY: previous.panY + deltaY,
      }),
    );
  }, []);

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

      if (response.status === 503) {
        setIsMapDisabled(true);
        setIsOnline(false);

        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load board");
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.pixels)) {
        throw new Error("Invalid board payload");
      }

      updateBoard(payload.pixels);
      setIsMapDisabled(false);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      setIsLoadingBoard(false);
    }
  }, [updateBoard]);

  const disablePlaceAction = useMemo(
    () =>
      isMapDisabled ||
      isLoadingBoard ||
      isPlaceActionDisabled(
        cooldownRemaining,
        Boolean(selectedCell),
        isPlacing,
      ),
    [cooldownRemaining, isMapDisabled, isLoadingBoard, selectedCell, isPlacing],
  );

  useEffect(() => {
    playerIdRef.current = getOrCreatePlayerId(PLAYER_ID_STORAGE_KEY);

    const timerId = window.setTimeout(() => {
      void loadBoard();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadBoard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadBoard();
    }, 1500);

    return () => {
      window.clearInterval(timer);
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
      void loadBoard();
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
      }
    };

    eventSource.onerror = () => {
      setIsOnline(false);
    };

    return () => {
      eventSource.close();
    };
  }, [loadBoard]);

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

    if (isLoadingBoard || isMapDisabled) {
      return;
    }

    const nextCell = readCellFromPointer(event);
    if (!nextCell) {
      return;
    }

    setSelectedCell(nextCell);
  };

  const handlePlacePixel = async () => {
    if (!selectedCell || disablePlaceAction || isMapDisabled) {
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

      const payload = await readJsonSafely(response);
      if (!isRecord(payload)) {
        return;
      }

      const placeResult = payload as PlaceResponse;

      if (response.status === 429 && isCooldownResponse(placeResult)) {
        const nextTime = Date.now() + placeResult.remainingSeconds * 1000;
        setCooldownUntil(nextTime);
        return;
      }

      if (response.status === 429 && isRateLimitedResponse(placeResult)) {
        return;
      }

      if (
        !response.ok &&
        !placeResult.ok &&
        placeResult.code === "STORE_UNAVAILABLE"
      ) {
        setIsMapDisabled(true);
        setIsOnline(false);
        return;
      }

      if (!response.ok || !placeResult.ok) {
        return;
      }

      setCooldownUntil(placeResult.nextAvailableAt);
      setBoard((previous) => {
        const next = [...previous];
        next[getCellIndex(selectedCell.x, selectedCell.y, BOARD_SIZE)] =
          selectedColor;
        return next;
      });
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
    if (isMapDisabled) {
      return;
    }

    dragRef.current = { x: event.clientX, y: event.clientY };
    dragMovedRef.current = false;
    setIsDragging(true);
  };

  const handleDragMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isMapDisabled) {
      return;
    }

    const hovered = readCellFromPointer(event);
    setHoveredCell(hovered);

    if (!dragRef.current) {
      return;
    }

    const scale = getCanvasScale(event.currentTarget);

    const deltaX = (event.clientX - dragRef.current.x) * scale;
    const deltaY = (event.clientY - dragRef.current.y) * scale;

    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
      dragMovedRef.current = true;
    }

    dragRef.current = { x: event.clientX, y: event.clientY };

    addPanDelta(deltaX, deltaY);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (isMapDisabled) {
      return;
    }

    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    touchDragRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (isMapDisabled) {
      return;
    }

    if (!touchDragRef.current || event.touches.length !== 1) {
      return;
    }

    event.preventDefault();

    const touch = event.touches[0];
    const scale = getCanvasScale(event.currentTarget);

    const deltaX = (touch.clientX - touchDragRef.current.x) * scale;
    const deltaY = (touch.clientY - touchDragRef.current.y) * scale;

    touchDragRef.current = { x: touch.clientX, y: touch.clientY };

    addPanDelta(deltaX, deltaY);
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
    if (isMapDisabled) {
      return;
    }

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
      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <InfoCard />
          <PaletteCard
            selectedColor={selectedColor}
            onSelectColor={setSelectedColor}
          />
          <SelectionCard
            isOnline={isOnline}
            selectedCell={selectedCell}
            selectedColor={selectedColor}
            cooldownRemaining={cooldownRemaining}
            isPlacing={isPlacing}
            disablePlaceAction={disablePlaceAction}
            onSelectColor={setSelectedColor}
            onPlace={handlePlacePixel}
          />
        </aside>

        <BoardSection
          isMapDisabled={isMapDisabled}
          isDragging={isDragging}
          viewState={viewState}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          onZoomChange={handleZoomSliderChange}
          canvasRef={canvasRef}
          onCanvasClick={handleCanvasClick}
          onCanvasWheel={handleCanvasWheel}
          onMouseDown={handleDragStart}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleCanvasLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </main>
    </div>
  );
}
