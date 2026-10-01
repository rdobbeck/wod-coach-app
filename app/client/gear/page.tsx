import Link from "next/link"
import gear from "@/data/gear.json"
import type { GearData, GearItem } from "@/lib/gear"
import CopyCode from "@/components/client/CopyCode"
import { requireClient } from "@/lib/require-client"

const data = gear as GearData

const OUT = { target: "_blank", rel: "sponsored noopener noreferrer" } as const

/* eslint-disable @next/next/no-img-element -- product images live on partner and Amazon CDNs */

/** Big card: the partnerships that matter most. Image, the pitch, the code, the button. */
function PartnerCard({ item }: { item: GearItem }) {
  return (
    <article data-testid="partner-card" className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
      {item.imageUrl && (
        <a href={item.url} {...OUT} className="block bg-white">
          <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="mx-auto h-44 w-full object-contain" />
        </a>
      )}
      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-accent">{item.brand}</p>
          <h3 className="font-display text-2xl font-bold leading-tight">{item.name}</h3>
        </div>
        <p className="text-sm text-app-muted">{item.blurb}</p>
        {item.deal && <p className="text-sm font-semibold">{item.deal}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {item.code && <CopyCode code={item.code} />}
          <a
            href={item.url}
            {...OUT}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-app-accent px-4 text-sm font-bold text-app-accent-text"
          >
            {item.cta}
          </a>
        </div>
      </div>
    </article>
  )
}

/** Compact card: the other direct programs. */
function ProgramCard({ item }: { item: GearItem }) {
  return (
    <article data-testid="program-card" className="flex gap-3 rounded-2xl border border-app-border bg-app-surface p-3">
      {item.imageUrl && (
        <a href={item.url} {...OUT} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white">
          <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
        </a>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="font-display text-lg font-bold leading-tight">{item.name}</h3>
        <p className="text-sm text-app-muted">{item.blurb}</p>
        {item.deal && <p className="text-xs font-semibold">{item.deal}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {item.code && <CopyCode code={item.code} />}
          <a href={item.url} {...OUT} className="text-sm font-bold text-app-accent">
            {item.cta} &rarr;
          </a>
        </div>
      </div>
    </article>
  )
}

/** One row in the long list. */
function PickRow({ item }: { item: GearItem }) {
  return (
    <li data-testid="pick-row" className="flex gap-3 border-b border-app-border py-3 last:border-b-0">
      <a href={item.url} {...OUT} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white">
        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" />}
      </a>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">
          {item.name}
          {item.featured && (
            <span className="ml-2 rounded-full bg-app-surface2 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-app-accent">
              Pick
            </span>
          )}
        </p>
        {item.blurb && <p className="mt-0.5 line-clamp-2 text-sm text-app-muted">{item.blurb}</p>}
        <a href={item.url} {...OUT} className="mt-1 inline-block text-sm font-bold text-app-accent">
          {item.cta} &rarr;
        </a>
      </div>
    </li>
  )
}

export default async function ClientGearPage() {
  await requireClient()
  return (
    <div className="space-y-6">
      <Link href="/client" className="text-sm font-semibold text-app-muted">
        &lsaquo; Today
      </Link>
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-bold">Gear</h1>
        <p className="text-sm text-app-muted">
          What I actually use and recommend, with the discounts my partners give you. Some links pay me a commission at no cost to you.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="partners">
        <h2 id="partners" className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">
          Partner deals
        </h2>
        {data.partners.map((item) => (
          <PartnerCard key={item.id} item={item} />
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="more-partners">
        <h2 id="more-partners" className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">
          More partners
        </h2>
        {data.morePartners.map((item) => (
          <ProgramCard key={item.id} item={item} />
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="picks">
        <h2 id="picks" className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">
          My picks
        </h2>
        <nav aria-label="Categories" className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-app-bg/95 px-4 py-2 backdrop-blur">
          {data.picks.map((c) => (
            <a key={c.key} href={`#${c.key.replace("_", "-")}`} className="shrink-0 rounded-full border border-app-border bg-app-surface px-3 py-1.5 text-sm font-semibold">
              {c.label}
            </a>
          ))}
        </nav>
        {data.picks.map((c) => (
          <div key={c.key} id={c.key.replace("_", "-")} className="scroll-mt-14 rounded-2xl border border-app-border bg-app-surface px-4">
            <h3 className="pt-3 font-display text-xl font-bold">{c.label}</h3>
            {data.disclaimers[c.key] && <p className="pt-1 text-xs text-app-muted">{data.disclaimers[c.key]}</p>}
            <ul>
              {c.items.map((item) => (
                <PickRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="space-y-1.5 text-xs text-app-muted">
        {data.disclosures.map((d) => (
          <p key={d}>{d}</p>
        ))}
        <p>
          The same list lives at{" "}
          <a href="https://ryandobbeck.com/gear" target="_blank" rel="noopener noreferrer" className="underline">
            ryandobbeck.com/gear
          </a>
          .
        </p>
      </section>
    </div>
  )
}
