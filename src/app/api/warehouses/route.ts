import { NextResponse } from "next/server";

import { getWarehouses } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const warehouses = await getWarehouses();
    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error("GET /api/warehouses failed", error);

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to load warehouses."
      },
      { status: 500 }
    );
  }
}
