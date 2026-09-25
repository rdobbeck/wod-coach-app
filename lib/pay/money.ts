/** Prices are stored in cents. Nothing here ever does arithmetic on dollars. */
export const MIN_CENTS = 100 // $1
export const MAX_CENTS = 500_000 // $5,000

export const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`

/** "120", "$120", "1,000.50" -> cents. Null for anything that is not a sane price. */
export function parseDollars(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[$,\s]/g, ""))
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return cents >= MIN_CENTS && cents <= MAX_CENTS ? cents : null
}

export const METHODS = ["STRIPE", "VENMO", "BANK", "CASH", "OTHER"] as const
export type Method = (typeof METHODS)[number]
export const METHOD_LABEL: Record<Method, string> = { STRIPE: "Card", VENMO: "Venmo", BANK: "Bank", CASH: "Cash", OTHER: "Other" }
