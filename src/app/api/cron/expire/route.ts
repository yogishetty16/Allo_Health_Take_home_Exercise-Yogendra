import { NextResponse } from "next/server";

import { releaseExpiredReservations } from "@/lib/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Invalid cron authorization header."
        },
        { status: 401 }
      );
    }
  }

  try {
    const result = await releaseExpiredReservations();
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/cron/expire failed", error);

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to release expired reservations."
      },
      { status: 500 }
    );
  }
}
