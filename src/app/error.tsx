"use client";

import { useEffect } from "react";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-md rounded-md border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          The inventory view could not be loaded. Try again after checking your
          database connection.
        </p>
        <Button className="mt-5" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </section>
    </main>
  );
}
