"use client";

import { PIXEL_PALETTE, type PixelColor } from "@/types/pixel";

import styles from "@/app/page.module.scss";

type SelectedCell = {
  x: number;
  y: number;
};

type Props = {
  isOnline: boolean;
  selectedCell: SelectedCell | null;
  selectedColor: PixelColor;
  cooldownRemaining: number;
  isPlacing: boolean;
  disablePlaceAction: boolean;
  onSelectColor: (color: PixelColor) => void;
  onPlace: () => void;
};

export function SelectionCard({
  isOnline,
  selectedCell,
  selectedColor,
  cooldownRemaining,
  isPlacing,
  disablePlaceAction,
  onSelectColor,
  onPlace,
}: Props) {
  return (
    <section className={`${styles.sectionCard} ${styles.selectionCard}`}>
      <div className={styles.selectionHeader}>
        <h2>Selection</h2>
        <span
          className={styles.liveBadge}
          data-state={isOnline ? "connected" : "disconnected"}
        >
          {isOnline ? "online" : "offline"}
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
              onClick={() => onSelectColor(color)}
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
      <p>
        Cooldown: {cooldownRemaining > 0 ? `${cooldownRemaining}s` : "Ready"}
      </p>
      <button
        type="button"
        className={styles.placeButton}
        onClick={onPlace}
        disabled={disablePlaceAction}
      >
        {isPlacing ? "Placing..." : "Place pixel"}
      </button>
    </section>
  );
}
