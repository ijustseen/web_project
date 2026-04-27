import { NextResponse } from "next/server";

import { BOARD_SIZE } from "@/services/pixel/constants";
import { getBoardSnapshotShared } from "@/services/pixel/store-shared";
import { PIXEL_PALETTE } from "@/types/pixel";

export async function GET() {
  const snapshot = await getBoardSnapshotShared();

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
