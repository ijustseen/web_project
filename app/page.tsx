"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BOARD_SIZE } from "@/services/pixel/constants";
import { PIXEL_PALETTE, type PixelColor } from "@/types/pixel";

import {
  getOrCreatePlayerId,
  isCooldownResponse,
  isRateLimitedResponse,
  isRecord,
  readJsonSafely,
} from "./pixel-battle/page-utils";
import type { PlaceResponse, SelectedCell } from "@/types/pixel-battle";
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

export default function Home() {
  const playerIdRef = useRef<string>("");

  const [board, setBoard] = useState<string[]>(() =>
    createBoardState(BOARD_SIZE, DEFAULT_CELL_COLOR),
  );
  const [selectedColor, setSelectedColor] = useState<PixelColor>(
    PIXEL_PALETTE[0],
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [isMapDisabled, setIsMapDisabled] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

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
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (
        event.key === "+" ||
        event.key === "-" ||
        event.key === "=" ||
        event.key === "0"
      ) {
        event.preventDefault();
      }
    };

    const preventGesture: EventListener = (event) => {
      event.preventDefault();
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("gesturestart", preventGesture, { passive: false });
    window.addEventListener("gesturechange", preventGesture, {
      passive: false,
    });
    window.addEventListener("gestureend", preventGesture, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("gesturestart", preventGesture);
      window.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("gestureend", preventGesture);
    };
  }, []);

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
          isLoadingBoard={isLoadingBoard}
          board={board}
          selectedCell={selectedCell}
          onSelectCell={setSelectedCell}
        />
      </main>
    </div>
  );
}
