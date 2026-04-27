import { NextResponse } from "next/server";

import { BOARD_SIZE } from "@/services/pixel/constants";
import {
  getBoardSnapshotShared,
  SharedStoreUnavailableError,
} from "@/services/pixel/store-shared";
import { PIXEL_PALETTE } from "@/types/pixel";

export async function GET() {
  let snapshot;

  try {
    snapshot = await getBoardSnapshotShared();
  } catch (error) {
    if (error instanceof SharedStoreUnavailableError) {
      return NextResponse.json(
        {
          code: "STORE_UNAVAILABLE",
          message: "Shared store is temporarily unavailable.",
        },
        { status: 503 },
      );
    }

    throw error;
  }

  return NextResponse.json(
    {
      boardSize: BOARD_SIZE,
      palette: PIXEL_PALETTE,
      pixels: snapshot,
      serverTime: Date.now(),
    },
    { status: 200 },
  );
}
