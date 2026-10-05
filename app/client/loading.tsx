/** Shown the moment any client page is opened, until the real page is ready. */
export default function ClientLoading() {
  return (
    <div data-testid="client-loading" role="status" aria-live="polite" className="space-y-4 pt-2">
      <div className="flex flex-col items-center gap-3 py-8">
        <span className="loading-breathe flex h-16 w-16 items-center justify-center rounded-2xl bg-app-accent font-display text-4xl font-bold text-app-accent-text shadow-lg">
          W
        </span>
        <span className="text-sm text-app-muted">Loading your training…</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="loading-shimmer h-20 rounded-2xl border border-app-border bg-app-surface"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}
