"use client";

import { cn } from "@officehub/ui";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("oh-skeleton rounded-oh-md", className)} />;
}

export function PageSkeleton({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-36 rounded-oh-lg" />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ListSkeleton({ rows = 3, label = "Đang tải…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-oh-lg" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
