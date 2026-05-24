import { createHash, randomUUID } from "crypto";

import {
  Prisma,
  ReservationStatus as PrismaReservationStatus
} from "@prisma/client";

import { releaseExpiredReservations, isExpired } from "@/lib/expiry";
import { prisma } from "@/lib/prisma";
import type { ReservationCreateInput } from "@/lib/validation";
import type { ReservationDto } from "@/lib/types";

export const RESERVATION_TTL_MINUTES = 10;

type Transaction = Prisma.TransactionClient;

type ServiceResponse = {
  status: number;
  body: Record<string, unknown>;
  replayed?: boolean;
};

type LockedReservationRow = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  status: PrismaReservationStatus;
  expires_at: Date;
};

type IdempotencyRow = {
  key: string;
  request_hash: string;
  status: string;
  response_code: number | null;
  response_body: Prisma.JsonValue | null;
};

const reservationInclude = {
  product: true,
  warehouse: true
} satisfies Prisma.ReservationInclude;

type ReservationWithRelations = Prisma.ReservationGetPayload<{
  include: typeof reservationInclude;
}>;

export function serializeReservation(
  reservation: ReservationWithRelations
): ReservationDto {
  return {
    id: reservation.id,
    productId: reservation.productId,
    warehouseId: reservation.warehouseId,
    productName: reservation.product.name,
    warehouseName: reservation.warehouse.name,
    warehouseLocation: reservation.warehouse.location,
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString()
  };
}

function hashReservationRequest(input: ReservationCreateInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity
      })
    )
    .digest("hex");
}

function conflict(message: string): ServiceResponse {
  return {
    status: 409,
    body: {
      error: "INSUFFICIENT_STOCK",
      message
    }
  };
}

async function createReservationInTransaction(
  tx: Transaction,
  input: ReservationCreateInput
): Promise<ServiceResponse> {
  await releaseExpiredReservations(tx, {
    productId: input.productId,
    warehouseId: input.warehouseId
  });

  const updatedInventory = await tx.$queryRaw<{ id: string }[]>`
    UPDATE inventory
    SET reserved_units = reserved_units + ${input.quantity},
        updated_at = now()
    WHERE product_id = ${input.productId}::uuid
      AND warehouse_id = ${input.warehouseId}::uuid
      AND (total_units - reserved_units) >= ${input.quantity}
    RETURNING id;
  `;

  if (updatedInventory.length === 0) {
    return conflict("Not enough available stock for this product at this warehouse.");
  }

  const reservation = await tx.reservation.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      status: PrismaReservationStatus.PENDING,
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000)
    },
    include: reservationInclude
  });

  return {
    status: 201,
    body: {
      reservation: serializeReservation(reservation)
    }
  };
}

export async function createReservation(
  input: ReservationCreateInput,
  options: { idempotencyKey?: string } = {}
): Promise<ServiceResponse> {
  const idempotencyKey = options.idempotencyKey?.trim();

  if (!idempotencyKey) {
    return prisma.$transaction((tx) => createReservationInTransaction(tx, input));
  }

  const requestHash = hashReservationRequest(input);

  return prisma.$transaction(async (tx) => {
    const insertedRows = await tx.$executeRaw`
      INSERT INTO idempotency_keys (
        id,
        key,
        request_hash,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${idempotencyKey},
        ${requestHash},
        'PROCESSING',
        now(),
        now()
      )
      ON CONFLICT (key) DO NOTHING;
    `;

    const records = await tx.$queryRaw<IdempotencyRow[]>`
      SELECT
        key,
        request_hash,
        status,
        response_code,
        response_body
      FROM idempotency_keys
      WHERE key = ${idempotencyKey}
      FOR UPDATE;
    `;

    const record = records[0];

    if (!record) {
      throw new Error("Failed to lock idempotency record.");
    }

    if (record.request_hash !== requestHash) {
      return {
        status: 409,
        body: {
          error: "IDEMPOTENCY_KEY_REUSED",
          message: "This Idempotency-Key was already used with a different request body."
        }
      };
    }

    if (
      record.status === "COMPLETED" &&
      record.response_code &&
      record.response_body
    ) {
      return {
        status: record.response_code,
        body: record.response_body as Record<string, unknown>,
        replayed: true
      };
    }

    if (insertedRows === 0) {
      return {
        status: 409,
        body: {
          error: "IDEMPOTENCY_IN_PROGRESS",
          message: "A request with this Idempotency-Key is already being processed."
        }
      };
    }

    const response = await createReservationInTransaction(tx, input);

    await tx.idempotencyRecord.update({
      where: {
        key: idempotencyKey
      },
      data: {
        status: "COMPLETED",
        responseCode: response.status,
        responseBody: response.body as Prisma.InputJsonObject
      }
    });

    return response;
  });
}

async function lockReservation(
  tx: Transaction,
  id: string
): Promise<LockedReservationRow | null> {
  const rows = await tx.$queryRaw<LockedReservationRow[]>`
    SELECT
      id,
      product_id,
      warehouse_id,
      quantity,
      status,
      expires_at
    FROM reservations
    WHERE id = ${id}::uuid
    FOR UPDATE;
  `;

  return rows[0] ?? null;
}

async function findReservation(tx: Transaction, id: string) {
  return tx.reservation.findUnique({
    where: {
      id
    },
    include: reservationInclude
  });
}

async function releaseLockedReservation(
  tx: Transaction,
  reservation: LockedReservationRow
) {
  await tx.$executeRaw`
    UPDATE inventory
    SET reserved_units = GREATEST(0, reserved_units - ${reservation.quantity}),
        updated_at = now()
    WHERE product_id = ${reservation.product_id}::uuid
      AND warehouse_id = ${reservation.warehouse_id}::uuid;
  `;

  return tx.reservation.update({
    where: {
      id: reservation.id
    },
    data: {
      status: PrismaReservationStatus.RELEASED
    },
    include: reservationInclude
  });
}

export async function getReservation(id: string): Promise<ReservationDto | null> {
  return prisma.$transaction(async (tx) => {
    const lockedReservation = await lockReservation(tx, id);

    if (!lockedReservation) {
      return null;
    }

    if (
      lockedReservation.status === PrismaReservationStatus.PENDING &&
      isExpired(lockedReservation.expires_at)
    ) {
      const released = await releaseLockedReservation(tx, lockedReservation);
      return serializeReservation(released);
    }

    const reservation = await findReservation(tx, id);
    return reservation ? serializeReservation(reservation) : null;
  });
}

export async function confirmReservation(id: string): Promise<ServiceResponse> {
  return prisma.$transaction(async (tx) => {
    const lockedReservation = await lockReservation(tx, id);

    if (!lockedReservation) {
      return {
        status: 404,
        body: {
          error: "RESERVATION_NOT_FOUND",
          message: "Reservation was not found."
        }
      };
    }

    if (lockedReservation.status === PrismaReservationStatus.CONFIRMED) {
      const reservation = await findReservation(tx, id);

      return {
        status: 200,
        body: {
          reservation: reservation ? serializeReservation(reservation) : null
        }
      };
    }

    if (lockedReservation.status === PrismaReservationStatus.RELEASED) {
      const reservation = await findReservation(tx, id);

      return {
        status: 409,
        body: {
          error: "RESERVATION_RELEASED",
          message: "This reservation has already been released.",
          reservation: reservation ? serializeReservation(reservation) : null
        }
      };
    }

    if (isExpired(lockedReservation.expires_at)) {
      const released = await releaseLockedReservation(tx, lockedReservation);

      return {
        status: 410,
        body: {
          error: "RESERVATION_EXPIRED",
          message: "Reservation expired before it could be confirmed. Stock was released.",
          reservation: serializeReservation(released)
        }
      };
    }

    const confirmed = await tx.reservation.update({
      where: {
        id
      },
      data: {
        status: PrismaReservationStatus.CONFIRMED
      },
      include: reservationInclude
    });

    return {
      status: 200,
      body: {
        reservation: serializeReservation(confirmed)
      }
    };
  });
}

export async function releaseReservation(id: string): Promise<ServiceResponse> {
  return prisma.$transaction(async (tx) => {
    const lockedReservation = await lockReservation(tx, id);

    if (!lockedReservation) {
      return {
        status: 404,
        body: {
          error: "RESERVATION_NOT_FOUND",
          message: "Reservation was not found."
        }
      };
    }

    if (lockedReservation.status === PrismaReservationStatus.RELEASED) {
      const reservation = await findReservation(tx, id);

      return {
        status: 200,
        body: {
          reservation: reservation ? serializeReservation(reservation) : null
        }
      };
    }

    if (lockedReservation.status === PrismaReservationStatus.CONFIRMED) {
      const reservation = await findReservation(tx, id);

      return {
        status: 409,
        body: {
          error: "RESERVATION_CONFIRMED",
          message: "Confirmed reservations cannot be released from checkout.",
          reservation: reservation ? serializeReservation(reservation) : null
        }
      };
    }

    const released = await releaseLockedReservation(tx, lockedReservation);

    return {
      status: 200,
      body: {
        reservation: serializeReservation(released)
      }
    };
  });
}
