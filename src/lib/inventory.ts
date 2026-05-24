import type { Prisma } from "@prisma/client";

import { releaseExpiredReservations } from "@/lib/expiry";
import { prisma } from "@/lib/prisma";
import type { InventoryDto, ProductInventoryDto, WarehouseDto } from "@/lib/types";

const productInventoryInclude = {
  inventories: {
    include: {
      warehouse: true
    },
    orderBy: {
      warehouse: {
        name: "asc"
      }
    }
  }
} satisfies Prisma.ProductInclude;

type ProductWithInventory = Prisma.ProductGetPayload<{
  include: typeof productInventoryInclude;
}>;

export function serializeWarehouse(warehouse: {
  id: string;
  name: string;
  location: string;
  createdAt: Date;
}): WarehouseDto {
  return {
    id: warehouse.id,
    name: warehouse.name,
    location: warehouse.location,
    createdAt: warehouse.createdAt.toISOString()
  };
}

function serializeInventory(
  inventory: ProductWithInventory["inventories"][number]
): InventoryDto {
  return {
    id: inventory.id,
    productId: inventory.productId,
    warehouseId: inventory.warehouseId,
    warehouse: serializeWarehouse(inventory.warehouse),
    totalUnits: inventory.totalUnits,
    reservedUnits: inventory.reservedUnits,
    availableUnits: inventory.totalUnits - inventory.reservedUnits,
    updatedAt: inventory.updatedAt.toISOString()
  };
}

function serializeProduct(product: ProductWithInventory): ProductInventoryDto {
  return {
    id: product.id,
    name: product.name,
    createdAt: product.createdAt.toISOString(),
    inventories: product.inventories.map(serializeInventory)
  };
}

export async function getProductsWithInventory(): Promise<ProductInventoryDto[]> {
  return prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx);

    const products = await tx.product.findMany({
      include: productInventoryInclude,
      orderBy: {
        name: "asc"
      }
    });

    return products.map(serializeProduct);
  });
}

export async function getWarehouses(): Promise<WarehouseDto[]> {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: {
      name: "asc"
    }
  });

  return warehouses.map(serializeWarehouse);
}
