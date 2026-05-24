import { Badge } from "@/components/ui/badge";
import type { ReservationStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ReservationStatus }) {
  if (status === "CONFIRMED") {
    return <Badge variant="success">Confirmed</Badge>;
  }

  if (status === "RELEASED") {
    return <Badge variant="secondary">Released</Badge>;
  }

  return <Badge variant="warning">Pending</Badge>;
}
