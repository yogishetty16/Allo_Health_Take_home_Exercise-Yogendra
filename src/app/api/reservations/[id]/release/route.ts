import { NextResponse } from "next/server";

import { releaseReservation } from "@/lib/reservations";
import { reservationIdSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const params = await context.params;
  const parsed = reservationIdSchema.safeParse(params.id);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_RESERVATION_ID",
        message: "Reservation id must be a UUID."
      },
      { status: 400 }
    );
  }

  try {
    const response = await releaseReservation(parsed.data);
    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    console.error("POST /api/reservations/:id/release failed", error);

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to release reservation."
      },
      { status: 500 }
    );
  }
}
