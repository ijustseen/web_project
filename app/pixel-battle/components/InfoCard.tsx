"use client";

import { BOARD_SIZE, COOLDOWN_SECONDS } from "@/services/pixel/constants";

import styles from "@/app/page.module.scss";

export function InfoCard() {
  return (
    <section className={`${styles.sectionCard} ${styles.infoCard}`}>
      <h1>
        Pixel Battle {BOARD_SIZE}x{BOARD_SIZE}
      </h1>
      <p>Global board, one pixel every {COOLDOWN_SECONDS} seconds.</p>
    </section>
  );
}
