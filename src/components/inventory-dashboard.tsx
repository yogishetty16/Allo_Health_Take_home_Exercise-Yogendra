"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Warehouse
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { ApiErrorBody, ProductInventoryDto } from "@/lib/types";

type InventoryDashboardProps = {
  initialProducts: ProductInventoryDto[];
};

type Notice = {
  type: "success" | "warning" | "error";
  title: string;
  message: string;
};

type ProductRow = {
  inventoryId: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

function flattenProducts(products: ProductInventoryDto[]): ProductRow[] {
  return products.flatMap((product) =>
    product.inventories.map((inventory) => ({
      inventoryId: inventory.id,
      productId: product.id,
      productName: product.name,
      warehouseId: inventory.warehouseId,
      warehouseName: inventory.warehouse.name,
      warehouseLocation: inventory.warehouse.location,
      totalUnits: inventory.totalUnits,
      reservedUnits: inventory.reservedUnits,
      availableUnits: inventory.availableUnits
    }))
  );
}

async function readResponseBody(response: Response) {
  try {
    return (await response.json()) as Partial<ApiErrorBody> & {
      reservation?: { id: string };
      products?: ProductInventoryDto[];
    };
  } catch {
    return {};
  }
}

function getDefaultQuantity(
  quantities: Record<string, number>,
  row: ProductRow
) {
  return quantities[row.inventoryId] ?? (row.availableUnits > 0 ? 1 : 0);
}

function createIdempotencyKey(inventoryId: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${new Date().getTime()}-${inventoryId}`;
}

export function InventoryDashboard({
  initialProducts
}: InventoryDashboardProps) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [idempotencyKeys, setIdempotencyKeys] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingInventoryId, setPendingInventoryId] = useState<string | null>(
    null
  );
  const [isNavigating, startNavigation] = useTransition();

  const rows = useMemo(() => flattenProducts(products), [products]);
  const totalAvailable = rows.reduce((sum, row) => sum + row.availableUnits, 0);
  const totalReserved = rows.reduce((sum, row) => sum + row.reservedUnits, 0);

  async function refreshProducts() {
    setRefreshing(true);

    try {
      const response = await fetch("/api/products", {
        cache: "no-store"
      });
      const body = await readResponseBody(response);

      if (!response.ok || !body.products) {
        throw new Error(body.message ?? "Unable to refresh products.");
      }

      setProducts(body.products);
    } catch (error) {
      setNotice({
        type: "error",
        title: "Refresh failed",
        message:
          error instanceof Error
            ? error.message
            : "The latest inventory could not be loaded."
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function reserve(row: ProductRow) {
    const quantity = getDefaultQuantity(quantities, row);

    if (quantity < 1) {
      setNotice({
        type: "warning",
        title: "Choose a quantity",
        message: "Quantity must be at least 1."
      });
      return;
    }

    setNotice(null);
    setPendingInventoryId(row.inventoryId);

    // Retrieve or generate an idempotency key for this row
    let activeKey = idempotencyKeys[row.inventoryId];
    if (!activeKey) {
      activeKey = createIdempotencyKey(row.inventoryId);
      setIdempotencyKeys((prev) => ({ ...prev, [row.inventoryId]: activeKey }));
    }

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": activeKey
        },
        body: JSON.stringify({
          productId: row.productId,
          warehouseId: row.warehouseId,
          quantity
        })
      });
      const body = await readResponseBody(response);

      if (response.status === 201 && body.reservation) {
        // Clear idempotency key on successful reservation creation
        setIdempotencyKeys((prev) => {
          const next = { ...prev };
          delete next[row.inventoryId];
          return next;
        });

        setNotice({
          type: "success",
          title: "Reservation created",
          message: "Stock is held for 10 minutes."
        });
        await refreshProducts();
        startNavigation(() => {
          router.push(`/reservations/${body.reservation?.id}`);
        });
        return;
      }

      if (response.status === 409) {
        // Clear idempotency key as the request resulted in a terminal conflict (stock changed)
        setIdempotencyKeys((prev) => {
          const next = { ...prev };
          delete next[row.inventoryId];
          return next;
        });

        setNotice({
          type: "warning",
          title: "Stock changed",
          message:
            body.message ??
            "Not enough stock remains. The table has been refreshed."
        });
        await refreshProducts();
        return;
      }

      if (response.status === 400) {
        // Clear idempotency key on terminal validation error
        setIdempotencyKeys((prev) => {
          const next = { ...prev };
          delete next[row.inventoryId];
          return next;
        });
      }

      setNotice({
        type: "error",
        title: "Reservation failed",
        message: body.message ?? "Reservation could not be created."
      });
      await refreshProducts();
    } catch (error) {
      setNotice({
        type: "error",
        title: "Network error",
        message:
          error instanceof Error
            ? error.message
            : "Reservation request failed."
      });
      // Do NOT clear activeKey in the catch block to allow the same key on user retry.
    } finally {
      setPendingInventoryId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Inventory Reservations
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
              Product availability by warehouse
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Available stock is calculated from committed inventory rows, with
              reservations held for 10 minutes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{totalAvailable} available</Badge>
            <Badge variant="outline">{totalReserved} reserved</Badge>
            <Button
              type="button"
              variant="outline"
              onClick={refreshProducts}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Refresh
            </Button>
          </div>
        </header>

        {notice ? (
          <Alert
            variant={
              notice.type === "error"
                ? "destructive"
                : notice.type === "warning"
                  ? "warning"
                  : "success"
            }
          >
            <div className="flex gap-3">
              {notice.type === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
              )}
              <div>
                <AlertTitle>{notice.title}</AlertTitle>
                <AlertDescription>{notice.message}</AlertDescription>
              </div>
            </div>
          </Alert>
        ) : null}

        <section className="rounded-md border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Inventory</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {rows.length} product-warehouse rows
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="w-28">Qty</TableHead>
                <TableHead className="w-36 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const quantity = getDefaultQuantity(quantities, row);
                const isPending =
                  pendingInventoryId === row.inventoryId || isNavigating;
                const isUnavailable = row.availableUnits <= 0;

                return (
                  <TableRow key={row.inventoryId}>
                    <TableCell>
                      <div className="font-medium">{row.productName}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.warehouseName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.warehouseLocation}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalUnits}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.reservedUnits}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={isUnavailable ? "destructive" : "success"}
                        className="justify-center tabular-nums"
                      >
                        {row.availableUnits}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Quantity for ${row.productName} at ${row.warehouseName}`}
                        type="number"
                        min={1}
                        max={Math.max(row.availableUnits, 1)}
                        value={quantity}
                        disabled={isUnavailable || isPending}
                        onChange={(event) => {
                          const nextQuantity = Number(event.target.value);
                          setQuantities((current) => ({
                            ...current,
                            [row.inventoryId]: Number.isFinite(nextQuantity)
                              ? nextQuantity
                              : 1
                          }));
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => reserve(row)}
                        disabled={
                          isUnavailable ||
                          isPending ||
                          quantity < 1 ||
                          quantity > row.availableUnits
                        }
                      >
                        {isPending ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                        )}
                        Reserve
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
  );
}
