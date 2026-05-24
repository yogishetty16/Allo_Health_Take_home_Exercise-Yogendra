import { InventoryDashboard } from "@/components/inventory-dashboard";
import { getProductsWithInventory } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const products = await getProductsWithInventory();

  return <InventoryDashboard initialProducts={products} />;
}
