import Link from "next/link"

/**
 * Dark frame for sign-in, sign-up and invite pages, matching the landing page
 * and coach pages so the first screens people see look like the product.
 */
export const authField =
  "block w-full rounded-xl border border-[#2c2f36] bg-[#0e0f12] px-4 py-3 text-base text-[#f4f1ea] placeholder:text-[#6f6a62] focus:border-[#c1272d] focus:outline-none disabled:text-[#8c8478]"
export const authLabel = "mb-1.5 block text-sm font-semibold text-[#c9c2b7]"
export const authPrimary =
  "flex h-12 w-full items-center justify-center rounded-xl bg-[#c1272d] font-display text-lg font-bold uppercase tracking-[0.06em] text-white disabled:opacity-60"
export const authSecondary =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#3a3d45] text-base font-semibold text-[#f4f1ea] disabled:opacity-60"
export const authLink = "font-semibold text-[#f4f1ea] underline decoration-[#c1272d] decoration-2 underline-offset-4"

export function AuthError({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-[#c1272d]/50 bg-[#c1272d]/10 px-4 py-3 text-sm text-[#f4b8ba]">{children}</p>
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export default function AuthShell({
  title,
  subtitle,
  kicker,
  children,
  footer,
}: {
  title: string
  subtitle?: React.ReactNode
  /** Small red label above the title, e.g. the coach's business name. */
  kicker?: string
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen flex-col bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <header className="mx-auto w-full max-w-md px-6 pt-8">
        <Link href="/" className="font-display text-2xl font-bold tracking-wide">
          WOD<span className="text-[#c1272d]">.</span>COACH
        </Link>
      </header>
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        {kicker && <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-[#c1272d]">{kicker}</p>}
        <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05]">{title}</h1>
        {subtitle && <p className="mt-3 text-base leading-relaxed text-[#b7afa3]">{subtitle}</p>}
        {children && <div className="mt-8">{children}</div>}
        {footer && <div className="mt-8 text-sm text-[#8c8478]">{footer}</div>}
      </section>
    </main>
  )
}
