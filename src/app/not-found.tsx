import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-md rounded-md border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Reservation not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This reservation may have been removed or the link may be incorrect.
        </p>
        <Button asChild className="mt-5">
          <Link href="/">Back to inventory</Link>
        </Button>
      </section>
    </main>
  );
}
