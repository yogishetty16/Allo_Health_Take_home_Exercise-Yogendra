import { notFound } from "next/navigation";

import { ReservationCheckout } from "@/components/reservation-checkout";
import { getReservation } from "@/lib/reservations";
import { reservationIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type ReservationPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReservationPage({ params }: ReservationPageProps) {
  const resolvedParams = await params;
  const parsed = reservationIdSchema.safeParse(resolvedParams.id);

  if (!parsed.success) {
    notFound();
  }

  const reservation = await getReservation(parsed.data);

  if (!reservation) {
    notFound();
  }

  const initialSecondsLeft = Math.max(
    0,
    Math.ceil(
      (new Date(reservation.expiresAt).getTime() - Date.now()) / 1000
    )
  );

  return (
    <ReservationCheckout
      initialReservation={reservation}
      initialSecondsLeft={initialSecondsLeft}
    />
  );
}
