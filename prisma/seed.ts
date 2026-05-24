import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.idempotencyRecord.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const [north, south, west] = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: "North Fulfillment",
        location: "Delhi"
      }
    }),
    prisma.warehouse.create({
      data: {
        name: "South Fulfillment",
        location: "Bengaluru"
      }
    }),
    prisma.warehouse.create({
      data: {
        name: "West Fulfillment",
        location: "Mumbai"
      }
    })
  ]);

  const [monitor, keyboard, scanner, demoUnit] = await Promise.all([
    prisma.product.create({
      data: {
        name: "27 inch Monitor"
      }
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Keyboard"
      }
    }),
    prisma.product.create({
      data: {
        name: "Barcode Scanner"
      }
    }),
    prisma.product.create({
      data: {
        name: "Concurrency Demo Unit"
      }
    })
  ]);
  const now = new Date();

  await prisma.inventory.createMany({
    data: [
      {
        productId: monitor.id,
        warehouseId: north.id,
        totalUnits: 12,
        reservedUnits: 0,
        updatedAt: now
      },
      {
        productId: monitor.id,
        warehouseId: south.id,
        totalUnits: 8,
        reservedUnits: 0,
        updatedAt: now
      },
      {
        productId: monitor.id,
        warehouseId: west.id,
        totalUnits: 5,
        reservedUnits: 0,
        updatedAt: now
      },
      {
        productId: keyboard.id,
        warehouseId: north.id,
        totalUnits: 25,
        reservedUnits: 0,
        updatedAt: now
      },
      {
        productId: keyboard.id,
        warehouseId: south.id,
        totalUnits: 18,
        reservedUnits: 0,
        updatedAt: now
      },
      {
        productId: scanner.id,
        warehouseId: west.id,
        totalUnits: 7,
        reservedUnits: 0,
        updatedAt: now
      },
      {
        productId: demoUnit.id,
        warehouseId: north.id,
        totalUnits: 1,
        reservedUnits: 0,
        updatedAt: now
      }
    ]
  });

  console.log("Seeded products, warehouses, and inventory.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
