"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Timer,
  XCircle
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { ApiErrorBody, ReservationDto } from "@/lib/types";

type Notice = {
  type: "success" | "warning" | "error";
  title: string;
  message: string;
};

type ReservationCheckoutProps = {
  initialReservation: ReservationDto;
  initialSecondsLeft: number;
};

function secondsUntil(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function formatUtcTimestamp(value: string) {
  return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

async function readResponseBody(response: Response) {
  try {
    return (await response.json()) as Partial<ApiErrorBody> & {
      reservation?: ReservationDto;
    };
  } catch {
    return {};
  }
}

export function ReservationCheckout({
  initialReservation,
  initialSecondsLeft
}: ReservationCheckoutProps) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initialReservation);
  const [secondsLeft, setSecondsLeft] = useState(initialSecondsLeft);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "confirm" | "release" | "refresh" | null
  >(null);
  const expiryRefreshStarted = useRef(false);

  const totalHoldSeconds = useMemo(() => {
    const created = new Date(reservation.createdAt).getTime();
    const expires = new Date(reservation.expiresAt).getTime();
    return Math.max(1, Math.round((expires - created) / 1000));
  }, [reservation.createdAt, reservation.expiresAt]);

  const progress = Math.max(
    0,
    Math.min(100, (secondsLeft / totalHoldSeconds) * 100)
  );
  const isPending = reservation.status === "PENDING";
  const canAct = isPending && secondsLeft > 0 && pendingAction === null;

  const refreshReservation = useCallback(async (showNotice = false) => {
    setPendingAction("refresh");

    try {
      const response = await fetch(`/api/reservations/${reservation.id}`, {
        cache: "no-store"
      });
      const body = await readResponseBody(response);

      if (!response.ok || !body.reservation) {
        throw new Error(body.message ?? "Unable to refresh reservation.");
      }

      setReservation(body.reservation);
      setSecondsLeft(secondsUntil(body.reservation.expiresAt));

      if (showNotice) {
        setNotice({
          type: "success",
          title: "Reservation refreshed",
          message: "The latest reservation state is displayed."
        });
      }

      router.refresh();
    } catch (error) {
      setNotice({
        type: "error",
        title: "Refresh failed",
        message:
          error instanceof Error
            ? error.message
            : "The reservation could not be refreshed."
      });
    } finally {
      setPendingAction(null);
    }
  }, [reservation.id, router]);

  async function runAction(action: "confirm" | "release") {
    setNotice(null);
    setPendingAction(action);

    try {
      const response = await fetch(`/api/reservations/${reservation.id}/${action}`, {
        method: "POST"
      });
      const body = await readResponseBody(response);

      if (body.reservation) {
        setReservation(body.reservation);
        setSecondsLeft(secondsUntil(body.reservation.expiresAt));
      }

      if (response.ok) {
        setNotice({
          type: "success",
          title: action === "confirm" ? "Reservation confirmed" : "Reservation cancelled",
          message:
            action === "confirm"
              ? "The reservation is now confirmed."
              : "Reserved stock has been released."
        });
        router.refresh();
        return;
      }

      if (response.status === 410) {
        setNotice({
          type: "warning",
          title: "Reservation expired",
          message:
            body.message ??
            "The hold expired before confirmation and the stock was released."
        });
        router.refresh();
        return;
      }

      setNotice({
        type: response.status === 409 ? "warning" : "error",
        title: response.status === 409 ? "Action unavailable" : "Action failed",
        message: body.message ?? "The reservation could not be updated."
      });
      router.refresh();
    } catch (error) {
      setNotice({
        type: "error",
        title: "Network error",
        message:
          error instanceof Error
            ? error.message
            : "The reservation request failed."
      });
    } finally {
      setPendingAction(null);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft(secondsUntil(reservation.expiresAt));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [reservation.expiresAt]);

  useEffect(() => {
    if (reservation.status !== "PENDING" || secondsLeft > 0) {
      expiryRefreshStarted.current = false;
      return;
    }

    if (expiryRefreshStarted.current) {
      return;
    }

    expiryRefreshStarted.current = true;
    const timeout = window.setTimeout(() => {
      void refreshReservation(false);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refreshReservation, reservation.status, secondsLeft]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-center">
          <div>
            <Button asChild variant="ghost" className="-ml-3 mb-2">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Inventory
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-normal">
              Reservation checkout
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirm before the hold expires or cancel to release stock.
            </p>
          </div>
          <StatusBadge status={reservation.status} />
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

        <Card>
          <CardHeader>
            <CardTitle>{reservation.productName}</CardTitle>
            <CardDescription>
              {reservation.warehouseName} - {reservation.warehouseLocation}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-md border p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Quantity
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {reservation.quantity}
                </div>
              </div>
              <div className="rounded-md border p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Status
                </div>
                <div className="mt-3">
                  <StatusBadge status={reservation.status} />
                </div>
              </div>
              <div className="rounded-md border p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Hold expires
                </div>
                <div className="mt-2 text-sm font-medium">
                  {formatUtcTimestamp(reservation.expiresAt)}
                </div>
              </div>
            </div>

            <section className="rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h2 className="text-sm font-semibold">Countdown</h2>
                </div>
                <span className="text-xl font-semibold tabular-nums">
                  {isPending ? formatDuration(secondsLeft) : "00:00"}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${isPending ? progress : 0}%` }}
                />
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => refreshReservation(true)}
                disabled={pendingAction !== null}
              >
                {pendingAction === "refresh" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runAction("release")}
                disabled={!canAct}
              >
                {pendingAction === "release" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                )}
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => runAction("confirm")}
                disabled={!canAct}
              >
                {pendingAction === "confirm" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                Confirm
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
