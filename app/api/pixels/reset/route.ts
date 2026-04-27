import { NextResponse } from "next/server";

import { broadcastRealtimeEvent } from "@/services/pixel/realtime";
import { resetBoardToWhite } from "@/services/pixel/store";

export async function POST() {
  resetBoardToWhite();
  broadcastRealtimeEvent({ type: "reset" });

  return NextResponse.json(
    {
      ok: true,
      message: "Board reset to white.",
    },
    { status: 200 },
  );
}
