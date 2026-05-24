import { prisma } from "@/lib/prisma";
import { createReservation } from "@/lib/reservations";

async function main() {
  const product = await prisma.product.findFirst({
    where: {
      name: "Concurrency Demo Unit"
    }
  });
  const warehouse = await prisma.warehouse.findFirst({
    where: {
      name: "North Fulfillment"
    }
  });

  if (!product || !warehouse) {
    throw new Error("Run npm run db:seed before npm run test:concurrency.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.idempotencyRecord.deleteMany();
    await tx.reservation.deleteMany({
      where: {
        productId: product.id,
        warehouseId: warehouse.id
      }
    });
    await tx.inventory.update({
      where: {
        productId_warehouseId: {
          productId: product.id,
          warehouseId: warehouse.id
        }
      },
      data: {
        totalUnits: 1,
        reservedUnits: 0
      }
    });
  });

  const input = {
    productId: product.id,
    warehouseId: warehouse.id,
    quantity: 1
  };

  const attempts = await Promise.allSettled([
    createReservation(input),
    createReservation(input)
  ]);

  const statuses = attempts.map((attempt) =>
    attempt.status === "fulfilled" ? attempt.value.status : "rejected"
  );
  const successCount = statuses.filter((status) => status === 201).length;
  const conflictCount = statuses.filter((status) => status === 409).length;

  console.table(
    attempts.map((attempt, index) => ({
      attempt: index + 1,
      status: attempt.status === "fulfilled" ? attempt.value.status : "rejected"
    }))
  );

  if (successCount !== 1 || conflictCount !== 1) {
    process.exitCode = 1;
    throw new Error(
      `Expected exactly one 201 and one 409, got ${statuses.join(", ")}.`
    );
  }

  console.log("Concurrency check passed: exactly one reservation succeeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
