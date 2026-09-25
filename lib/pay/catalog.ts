/**
 * The coach's usual prices, in cents. A session is $100; at the gym pod the
 * client books the pod separately (about $15-20) and the coach meets them there,
 * so the pod is not part of what the coach charges. Packages are valid 4 months.
 */
export type CatalogItem = { name: string; description: string; priceCents: number; sessions: number }

export const USUAL_CATALOG: CatalogItem[] = [
  { name: "First session", description: "New clients: movement assessment plus your first 60 minute session.", priceCents: 14_000, sessions: 1 },
  { name: "Gym pod session", description: "60 minutes in person. You book the pod yourself (about $15-20) and I meet you there.", priceCents: 10_000, sessions: 1 },
  { name: "Off-site session", description: "60 minutes, I come to you.", priceCents: 10_000, sessions: 1 },
  { name: "3-session package", description: "Three 60 minute sessions. Valid 4 months from purchase.", priceCents: 37_500, sessions: 3 },
  { name: "5-session package", description: "Five 60 minute sessions. Valid 4 months from purchase.", priceCents: 59_500, sessions: 5 },
  { name: "10-session package", description: "Ten 60 minute sessions. Valid 4 months from purchase.", priceCents: 100_000, sessions: 10 },
  { name: "20-session package", description: "Twenty 60 minute sessions. Valid 4 months from purchase.", priceCents: 190_000, sessions: 20 },
]
