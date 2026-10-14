import Link from "next/link"

/** Public shell for /learn: the client theme tokens on the default dark look, no sign-in. */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app-theme="dark" className="min-h-screen bg-app-bg font-sans text-app-text">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-display text-xl font-bold tracking-wide">WOD.COACH</Link>
        <Link href="/learn" className="text-sm font-semibold text-app-muted">Learn</Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
    </div>
  )
}
