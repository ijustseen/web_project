"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CANVAS_VIEW_SIZE } from "../page-utils";
import { BOARD_SIZE } from "@/services/pixel/constants";
import type { SelectedCell, ViewState } from "@/types/pixel-battle";

import { clampViewState, getCanvasScale, toRgb } from "../page-utils";

import styles from "@/app/page.module.scss";

const DEFAULT_CELL_COLOR = "#ffffff";
const MIN_ZOOM = CANVAS_VIEW_SIZE / BOARD_SIZE;
const INITIAL_ZOOM = MIN_ZOOM;
const MAX_ZOOM = 16;
const WHEEL_ZOOM_SENSITIVITY = 0.001;

type Props = {
  isMapDisabled: boolean;
  isLoadingBoard: boolean;
  board: string[];
  selectedCell: SelectedCell | null;
  onSelectCell: (cell: SelectedCell) => void;
};

export function BoardSection({
  isMapDisabled,
  isLoadingBoard,
  board,
  selectedCell,
  onSelectCell,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const touchDragRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const pinchRef = useRef<{
    startDistance: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    startCenterX: number;
    startCenterY: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<SelectedCell | null>(null);
  const [viewState, setViewState] = useState<ViewState>({
    zoom: INITIAL_ZOOM,
    panX: 0,
    panY: 0,
  });

  const effectiveBoard = useMemo(() => {
    if (board.length === BOARD_SIZE * BOARD_SIZE) {
      return board;
    }

    return Array.from(
      { length: BOARD_SIZE * BOARD_SIZE },
      () => DEFAULT_CELL_COLOR,
    );
  }, [board]);

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

    for (let i = 0; i < effectiveBoard.length; i += 1) {
      const [red, green, blue] = toRgb(effectiveBoard[i]);
      const offset = i * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }

    sourceContext.putImageData(imageData, 0, 0);

    context.save();
    context.imageSmoothingEnabled = false;
    context.fillStyle = DEFAULT_CELL_COLOR;
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
  }, [effectiveBoard, hoveredCell, selectedCell, viewState]);

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

  const readTouchPoint = (
    event: React.TouchEvent<HTMLCanvasElement>,
    touch: { clientX: number; clientY: number },
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaledX =
      ((touch.clientX - rect.left) * CANVAS_VIEW_SIZE) / rect.width;
    const scaledY =
      ((touch.clientY - rect.top) * CANVAS_VIEW_SIZE) / rect.height;
    return { x: scaledX, y: scaledY };
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

    onSelectCell(nextCell);
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

  const handleCanvasLeave = () => {
    handleDragEnd();
    setHoveredCell(null);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (isMapDisabled) {
      return;
    }

    if (event.touches.length === 1) {
      pinchRef.current = null;
      const touch = event.touches[0];
      touchDragRef.current = { x: touch.clientX, y: touch.clientY };
      setIsDragging(true);
      return;
    }

    if (event.touches.length === 2) {
      touchDragRef.current = null;

      const first = event.touches[0];
      const second = event.touches[1];
      const firstPoint = readTouchPoint(event, first);
      const secondPoint = readTouchPoint(event, second);

      const dx = secondPoint.x - firstPoint.x;
      const dy = secondPoint.y - firstPoint.y;
      const distance = Math.hypot(dx, dy);
      const centerX = (firstPoint.x + secondPoint.x) / 2;
      const centerY = (firstPoint.y + secondPoint.y) / 2;

      pinchRef.current = {
        startDistance: distance,
        startZoom: viewState.zoom,
        startPanX: viewState.panX,
        startPanY: viewState.panY,
        startCenterX: centerX,
        startCenterY: centerY,
      };

      setIsDragging(true);
    }
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (isMapDisabled) {
      return;
    }

    if (event.touches.length === 1 && touchDragRef.current) {
      event.preventDefault();

      const touch = event.touches[0];
      const scale = getCanvasScale(event.currentTarget);

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

      return;
    }

    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();

      const first = event.touches[0];
      const second = event.touches[1];
      const firstPoint = readTouchPoint(event, first);
      const secondPoint = readTouchPoint(event, second);

      const dx = secondPoint.x - firstPoint.x;
      const dy = secondPoint.y - firstPoint.y;
      const distance = Math.hypot(dx, dy);
      const centerX = (firstPoint.x + secondPoint.x) / 2;
      const centerY = (firstPoint.y + secondPoint.y) / 2;

      const pinch = pinchRef.current;
      const zoomScale =
        pinch.startDistance > 0 ? distance / pinch.startDistance : 1;
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, pinch.startZoom * zoomScale),
      );

      const worldX = (pinch.startCenterX - pinch.startPanX) / pinch.startZoom;
      const worldY = (pinch.startCenterY - pinch.startPanY) / pinch.startZoom;

      const nextPanX = centerX - worldX * nextZoom;
      const nextPanY = centerY - worldY * nextZoom;

      setViewState(
        clampViewState({
          zoom: nextZoom,
          panX: nextPanX,
          panY: nextPanY,
        }),
      );
    }
  };

  const handleTouchEnd = () => {
    touchDragRef.current = null;
    pinchRef.current = null;
    setIsDragging(false);
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
      const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, previous.zoom * zoomFactor),
      );

      if (nextZoom === previous.zoom) {
        return previous;
      }

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
    <section
      className={`${styles.boardSection} ${isMapDisabled ? styles.boardSectionDisabled : ""}`}
    >
      {isMapDisabled ? (
        <div className={styles.boardDisabledOverlay}>
          Shared store unavailable. Map is temporarily disabled.
        </div>
      ) : null}

      <div className={styles.zoomSliderWrap}>
        <label htmlFor="zoom-slider">Zoom</label>
        <input
          id="zoom-slider"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.1}
          value={viewState.zoom}
          disabled={isMapDisabled}
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
        Tap to select. Drag with mouse to move camera. Use zoom slider or mouse
        wheel.
      </p>
    </section>
  );
}
