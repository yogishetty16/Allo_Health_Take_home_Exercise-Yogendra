import { NextResponse } from "next/server";

import { getReservation } from "@/lib/reservations";
import { reservationIdSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
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
    const reservation = await getReservation(parsed.data);

    if (!reservation) {
      return NextResponse.json(
        {
          error: "RESERVATION_NOT_FOUND",
          message: "Reservation was not found."
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ reservation });
  } catch (error) {
    console.error("GET /api/reservations/:id failed", error);

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to load reservation."
      },
      { status: 500 }
    );
  }
}
