import { noLongDashes } from "@/lib/text"

/**
 * The gear page: Ryan's partner deals and Amazon picks, mirrored from the
 * ryandobbeck.com /gear catalog (~/Documents/affiliate-gear/catalog.json).
 *
 * Tiers, top to bottom:
 *   1. partners      the three brand partnerships that matter most, as hero cards
 *   2. morePartners  the other direct partner programs
 *   3. picks         everything else, grouped by category, featured items first
 *
 * `scripts/sync-gear.ts` runs buildGear over the catalog and writes data/gear.json,
 * which the page imports at build time. Nothing here touches the database.
 */

/** A product as it sits in catalog.json. Only the fields we read. */
export type CatalogProduct = {
  id: string
  name: string
  brand?: string
  category: string
  subcategory?: string
  source?: string
  amazon_url?: string
  affiliate_url?: string
  promo_code?: string
  image_url?: string
  price_band?: string
  blurb?: string
  cta_label?: string
  featured?: boolean
  staged?: boolean
}

export type Catalog = {
  meta: {
    disclosures?: Record<string, string>
    categories?: string[]
    category_disclaimers?: Record<string, string>
    updated?: string
  }
  products: CatalogProduct[]
}

export type GearItem = {
  id: string
  name: string
  brand: string
  blurb: string
  imageUrl: string | null
  url: string
  cta: string
  /** Promo code to copy at checkout, when the deal needs one. */
  code: string | null
  /** One line on what the client gets: "10% off with the code". */
  deal: string | null
  source: string
  category: string
  priceBand: string | null
  featured: boolean
}

export type GearCategory = { key: string; label: string; items: GearItem[] }

export type GearData = {
  partners: GearItem[]
  morePartners: GearItem[]
  picks: GearCategory[]
  /** Every partner disclosure, in the order the partners appear. */
  disclosures: string[]
  /** Category key -> disclaimer shown under that group (supplements). */
  disclaimers: Record<string, string>
  updated: string | null
}

/** Front and center: the partnerships that earn the most and that clients use the most. */
export const PARTNER_ORDER = ["equip", "nunorm", "victorygrips"] as const
/** The rest of the direct programs, by what they pay. */
export const MORE_PARTNER_ORDER = ["fullscript", "airwaav", "whoop", "hume"] as const

const SOURCE: Record<string, { cta: string; deal?: string }> = {
  equip: { cta: "Shop Equip Foods", deal: "Use the code at checkout" },
  nunorm: { cta: "Shop NUNORM", deal: "10% off with the code" },
  victorygrips: { cta: "Shop Victory Grips", deal: "10% off through this link" },
  fullscript: { cta: "Open the dispensary", deal: "10% off retail, more off your first order and auto-refills" },
  airwaav: { cta: "Shop AIRWAAV", deal: "10% off through this link" },
  whoop: { cta: "Join Whoop", deal: "Free month through this link" },
  hume: { cta: "Shop Hume Health", deal: "$20 off through this link" },
  rogue: { cta: "Shop at Rogue" },
  eleiko: { cta: "Shop Eleiko" },
  rep: { cta: "Shop REP Fitness" },
  amazon: { cta: "View on Amazon" },
}

export const CATEGORY_LABEL: Record<string, string> = {
  training_gear: "Training gear",
  recovery: "Recovery",
  nutrition: "Nutrition",
  books: "Books",
  skincare: "Skin",
}

function toItem(p: CatalogProduct): GearItem | null {
  const source = p.source ?? "amazon"
  const url = p.affiliate_url ?? p.amazon_url
  if (!url) return null
  const s = SOURCE[source]
  return {
    id: p.id,
    name: noLongDashes(p.name),
    brand: noLongDashes(p.brand ?? ""),
    blurb: noLongDashes(p.blurb ?? ""),
    imageUrl: p.image_url || null,
    url,
    cta: p.cta_label ?? s?.cta ?? "Shop",
    code: p.promo_code ?? null,
    deal: s?.deal ?? null,
    source,
    category: p.category,
    priceBand: p.price_band ?? null,
    featured: !!p.featured,
  }
}

/** The four dispensary collections become one card: it is one storefront. */
function fullscriptCard(items: GearItem[]): GearItem | null {
  const first = items[0]
  if (!first) return null
  return {
    ...first,
    id: "fullscript-dispensary",
    name: "Fullscript Dispensary",
    brand: "Fullscript",
    blurb:
      "Practitioner-grade supplements (Thorne and friends) in my own dispensary, 10% under retail on every order. Collections for muscle gain, fat loss, everyday foundations, and recovery and sleep.",
    featured: true,
  }
}

export function buildGear(catalog: Catalog): GearData {
  const live = catalog.products.filter((p) => !p.staged)
  const items = live.map(toItem).filter((x): x is GearItem => !!x)
  const bySource = (src: string) => items.filter((i) => i.source === src)

  const partners = PARTNER_ORDER.map((src) => bySource(src)[0]).filter((x): x is GearItem => !!x)
  const morePartners = MORE_PARTNER_ORDER.map((src) => (src === "fullscript" ? fullscriptCard(bySource(src)) : bySource(src)[0])).filter(
    (x): x is GearItem => !!x,
  )

  // Everything not shown as a partner card. Extra variants of a partner product
  // (the other AIRWAAV mouthpieces) still get a row in their category.
  const shown = new Set([...partners, ...morePartners].map((i) => i.id))
  const rest = items.filter((i) => !shown.has(i.id) && i.source !== "fullscript")
  const order = catalog.meta.categories ?? Object.keys(CATEGORY_LABEL)
  const picks: GearCategory[] = order
    .map((key) => ({
      key,
      label: CATEGORY_LABEL[key] ?? key,
      items: rest.filter((i) => i.category === key).sort((a, b) => Number(b.featured) - Number(a.featured)),
    }))
    .filter((c) => c.items.length > 0)

  const disclosures = [...PARTNER_ORDER, ...MORE_PARTNER_ORDER, "amazon"]
    .map((k) => catalog.meta.disclosures?.[k])
    .filter((x): x is string => !!x)
    .map(noLongDashes)

  const disclaimers: Record<string, string> = {}
  for (const [k, v] of Object.entries(catalog.meta.category_disclaimers ?? {})) disclaimers[k] = noLongDashes(v)

  return { partners, morePartners, picks, disclosures, disclaimers, updated: catalog.meta.updated ?? null }
}
