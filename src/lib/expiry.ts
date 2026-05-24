import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Transaction = Prisma.TransactionClient;

type ExpiryScope = {
  productId?: string;
  warehouseId?: string;
};

type ExpiryResult = {
  releasedCount: number;
  touchedInventoryCount: number;
};

const emptyExpiryResult: ExpiryResult = {
  releasedCount: 0,
  touchedInventoryCount: 0
};

export function isExpired(expiresAt: Date | string, now = new Date()) {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export async function releaseExpiredReservations(
  client: Transaction | typeof prisma = prisma,
  scope: ExpiryScope = {}
): Promise<ExpiryResult> {
  const rows =
    scope.productId && scope.warehouseId
      ? await client.$queryRaw<ExpiryResult[]>`
          WITH expired AS (
            UPDATE reservations
            SET status = 'RELEASED'::"ReservationStatus",
                updated_at = now()
            WHERE status = 'PENDING'::"ReservationStatus"
              AND expires_at <= now()
              AND product_id = ${scope.productId}::uuid
              AND warehouse_id = ${scope.warehouseId}::uuid
            RETURNING product_id, warehouse_id, quantity
          ),
          released AS (
            SELECT product_id, warehouse_id, SUM(quantity)::integer AS quantity
            FROM expired
            GROUP BY product_id, warehouse_id
          ),
          inventory_update AS (
            UPDATE inventory i
            SET reserved_units = GREATEST(0, i.reserved_units - released.quantity),
                updated_at = now()
            FROM released
            WHERE i.product_id = released.product_id
              AND i.warehouse_id = released.warehouse_id
            RETURNING i.id
          )
          SELECT
            (SELECT COUNT(*)::integer FROM expired) AS "releasedCount",
            (SELECT COUNT(*)::integer FROM inventory_update) AS "touchedInventoryCount";
        `
      : await client.$queryRaw<ExpiryResult[]>`
          WITH expired AS (
            UPDATE reservations
            SET status = 'RELEASED'::"ReservationStatus",
                updated_at = now()
            WHERE status = 'PENDING'::"ReservationStatus"
              AND expires_at <= now()
            RETURNING product_id, warehouse_id, quantity
          ),
          released AS (
            SELECT product_id, warehouse_id, SUM(quantity)::integer AS quantity
            FROM expired
            GROUP BY product_id, warehouse_id
          ),
          inventory_update AS (
            UPDATE inventory i
            SET reserved_units = GREATEST(0, i.reserved_units - released.quantity),
                updated_at = now()
            FROM released
            WHERE i.product_id = released.product_id
              AND i.warehouse_id = released.warehouse_id
            RETURNING i.id
          )
          SELECT
            (SELECT COUNT(*)::integer FROM expired) AS "releasedCount",
            (SELECT COUNT(*)::integer FROM inventory_update) AS "touchedInventoryCount";
        `;

  return rows[0] ?? emptyExpiryResult;
}
