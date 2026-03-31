export default function FrontendLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-pulse">
      {/* Title skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-64 rounded-lg bg-muted" />
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-muted" />
              <div className="space-y-2 flex-1">
                <div className="h-6 w-16 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* List skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-48 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
