"use client";

import type React from "react";

import { CANVAS_VIEW_SIZE } from "../page-utils";
import type { ViewState } from "@/types/pixel-battle";

import styles from "@/app/page.module.scss";

type Props = {
  isMapDisabled: boolean;
  isDragging: boolean;
  viewState: ViewState;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (nextZoom: number) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onCanvasWheel: (event: React.WheelEvent<HTMLCanvasElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: () => void;
};

export function BoardSection({
  isMapDisabled,
  isDragging,
  viewState,
  minZoom,
  maxZoom,
  onZoomChange,
  canvasRef,
  onCanvasClick,
  onCanvasWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: Props) {
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
          min={minZoom}
          max={maxZoom}
          step={0.1}
          value={viewState.zoom}
          disabled={isMapDisabled}
          onChange={(event) => onZoomChange(Number(event.target.value))}
        />
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_VIEW_SIZE}
        height={CANVAS_VIEW_SIZE}
        className={`${styles.boardCanvas} ${isDragging ? styles.dragging : ""}`}
        onClick={onCanvasClick}
        onWheel={onCanvasWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
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
