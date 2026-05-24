export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED";

export type WarehouseDto = {
  id: string;
  name: string;
  location: string;
  createdAt: string;
};

export type InventoryDto = {
  id: string;
  productId: string;
  warehouseId: string;
  warehouse: WarehouseDto;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  updatedAt: string;
};

export type ProductInventoryDto = {
  id: string;
  name: string;
  createdAt: string;
  inventories: InventoryDto[];
};

export type ReservationDto = {
  id: string;
  productId: string;
  warehouseId: string;
  productName: string;
  warehouseName: string;
  warehouseLocation: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiErrorBody = {
  error: string;
  message: string;
  issues?: unknown;
};
