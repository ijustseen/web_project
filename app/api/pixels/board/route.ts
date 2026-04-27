import { NextResponse } from "next/server";

import { BOARD_SIZE } from "@/services/pixel/constants";
import { getBoardSnapshot } from "@/services/pixel/store";
import { PIXEL_PALETTE } from "@/types/pixel";

export async function GET() {
  return NextResponse.json(
    {
      boardSize: BOARD_SIZE,
      palette: PIXEL_PALETTE,
      pixels: getBoardSnapshot(),
      serverTime: Date.now(),
    },
    { status: 200 },
  );
}
