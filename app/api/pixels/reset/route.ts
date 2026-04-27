import { NextResponse } from "next/server";

import { publishRealtimeEvent } from "@/services/pixel/realtime";
import {
  resetBoardToWhiteShared,
  SharedStoreUnavailableError,
} from "@/services/pixel/store-shared";

export async function POST() {
  try {
    await resetBoardToWhiteShared();
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

  await publishRealtimeEvent({ type: "reset" });

  return NextResponse.json(
    {
      ok: true,
      message: "Board reset to white.",
    },
    { status: 200 },
  );
}
