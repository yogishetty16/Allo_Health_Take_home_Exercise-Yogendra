import { NextResponse } from "next/server";

import { getProductsWithInventory } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await getProductsWithInventory();
    return NextResponse.json({ products });
  } catch (error) {
    console.error("GET /api/products failed", error);

    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to load products."
      },
      { status: 500 }
    );
  }
}
