"use client";

import { PIXEL_PALETTE, type PixelColor } from "@/types/pixel";

import styles from "@/app/page.module.scss";

type Props = {
  selectedColor: PixelColor;
  onSelectColor: (color: PixelColor) => void;
};

export function PaletteCard({ selectedColor, onSelectColor }: Props) {
  return (
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
              onClick={() => onSelectColor(color)}
              aria-label={`Select color ${color}`}
            />
          );
        })}
      </div>
    </section>
  );
}
