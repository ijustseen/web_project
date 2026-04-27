import { NextResponse } from "next/server";

import { publishRealtimeEvent } from "@/services/pixel/realtime";
import { resetBoardToWhiteShared } from "@/services/pixel/store-shared";

export async function POST() {
  await resetBoardToWhiteShared();
  await publishRealtimeEvent({ type: "reset" });

  return NextResponse.json(
    {
      ok: true,
      message: "Board reset to white.",
    },
    { status: 200 },
  );
}
