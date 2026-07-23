export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded bg-border/60" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-border/40" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-border/40" />
    </div>
  );
}
