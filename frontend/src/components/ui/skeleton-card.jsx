/**
 * Reusable skeleton loaders for dashboard and list pages.
 */
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
      {...props}
    />
  );
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3", className)}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function SkeletonKPI() {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col items-center gap-2">
      <Skeleton className="h-5 w-5 rounded-full" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="px-4 py-3 flex items-center gap-3 border-b last:border-0">
      <Skeleton className="h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-16 shrink-0" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}