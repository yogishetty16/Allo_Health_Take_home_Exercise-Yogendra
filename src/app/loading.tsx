import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}
