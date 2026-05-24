import { NextResponse } from "next/server";

import { createReservation } from "@/lib/reservations";
import { reservationCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = reservationCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message: "Request body must include valid productId, warehouseId, and quantity.",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();

  if (idempotencyKey && idempotencyKey.length > 255) {
    return NextResponse.json(
      {
        error: "INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency-Key must be 255 characters or fewer."
      },
      { status: 400 }
    );
  }

  try {
    const response = await createReservation(parsed.data, {
      idempotencyKey: idempotencyKey || undefined
    });

    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.replayed
        ? {
            "Idempotent-Replayed": "true"
          }
        : undefined
    });
  } catch (error) {
    console.error("POST /api/reservations failed", error);

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to create reservation."
      },
      { status: 500 }
    );
  }
}
