import Link from "next/link"

/** What an empty coach page says instead of "No X yet": what it's for and the next step. */
export default function EmptyState({
  title,
  body,
  href,
  cta,
  secondary,
}: {
  title: string
  body: React.ReactNode
  href: string
  cta: string
  secondary?: { href: string; label: string }
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d2c5] bg-white px-6 py-12 text-center">
      <h2 className="font-display text-3xl font-bold text-[#16181d]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#6b6257]">{body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={href} className="rounded-xl bg-[#16181d] px-5 py-2.5 text-sm font-semibold text-[#f4f1ea]">
          {cta}
        </Link>
        {secondary && (
          <Link href={secondary.href} className="rounded-xl border border-[#ddd7cc] bg-white px-5 py-2.5 text-sm font-semibold text-[#16181d]">
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  )
}
