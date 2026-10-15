import crosswalk from "../../data/anatomy/authored/muscle-groups.json"
import type { Highlight } from "../learn-viewer"

/**
 * Training groups: how a coach talks about muscles. Each maps to the Learn structures it covers
 * (data/anatomy/authored/muscle-groups.json). Order here is the order chips and lists use.
 */
export const MUSCLE_GROUPS = [
  { id: "chest", label: "Chest" },
  { id: "front-delts", label: "Front delts" },
  { id: "side-delts", label: "Side delts" },
  { id: "rear-delts", label: "Rear delts" },
  { id: "rotator-cuff", label: "Rotator cuff" },
  { id: "lats", label: "Lats" },
  { id: "upper-back", label: "Upper back" },
  { id: "traps", label: "Traps" },
  { id: "serratus", label: "Serratus" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "forearms", label: "Forearms and grip" },
  { id: "abs", label: "Abs" },
  { id: "obliques", label: "Obliques" },
  { id: "lower-back", label: "Lower back" },
  { id: "glutes", label: "Glutes" },
  { id: "side-glutes", label: "Side glutes" },
  { id: "hip-rotators", label: "Deep hip rotators" },
  { id: "hip-flexors", label: "Hip flexors" },
  { id: "quads", label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "adductors", label: "Adductors" },
  { id: "calves", label: "Calves" },
  { id: "shins", label: "Shins and ankles" },
  { id: "neck", label: "Neck" },
] as const

export type GroupId = (typeof MUSCLE_GROUPS)[number]["id"]

const ORDER = new Map<string, number>(MUSCLE_GROUPS.map((g, i) => [g.id, i]))
const LABEL = new Map<string, string>(MUSCLE_GROUPS.map((g) => [g.id, g.label]))
const STRUCTURES = crosswalk as Record<string, string[]>
let inverse: Map<string, GroupId> | null = null

export const isGroupId = (x: unknown): x is GroupId => typeof x === "string" && ORDER.has(x)
export const groupLabel = (id: GroupId) => LABEL.get(id) ?? id
export const structuresOf = (id: GroupId): string[] => STRUCTURES[id] ?? []

export function groupOfStructure(structureId: string): GroupId | null {
  if (!inverse) {
    inverse = new Map()
    for (const g of MUSCLE_GROUPS) for (const s of structuresOf(g.id)) inverse.set(s, g.id)
  }
  return inverse.get(structureId) ?? null
}

/** Valid ids only, each once, in vocabulary order. */
export function orderGroups(ids: readonly string[]): GroupId[] {
  const keep = new Set(ids.filter(isGroupId))
  return MUSCLE_GROUPS.map((g) => g.id).filter((id) => keep.has(id))
}

export const parseGroups = (raw: string | null | undefined): GroupId[] => orderGroups((raw ?? "").split(",").map((s) => s.trim()))

export function musclesHref(t: { primary: readonly string[]; secondary: readonly string[] }, from: string) {
  const q = new URLSearchParams()
  q.set("highlight", orderGroups(t.primary).join(","))
  const also = orderGroups(t.secondary)
  if (also.length) q.set("also", also.join(","))
  q.set("from", from)
  return `/client/learn/muscles?${q.toString()}`
}

/** Learn's Muscles worked parameters: main groups, other groups (never also main), and the exercise's name. */
export function parseWorked(get: (key: string) => string | null) {
  const primary = parseGroups(get("highlight"))
  const secondary = parseGroups(get("also")).filter((g) => !primary.includes(g))
  const from = (get("from") ?? "").trim().slice(0, 80) || null
  return { primary, secondary, from }
}

/** The structures Muscles worked lights, or null when it lights none. */
export function highlightOf(w: { primary: readonly GroupId[]; secondary: readonly GroupId[] }): Highlight | null {
  if (!w.primary.length && !w.secondary.length) return null
  const ids = (groups: readonly GroupId[]) => new Set(groups.reduce<string[]>((all, g) => all.concat(structuresOf(g)), []))
  return { primary: ids(w.primary), secondary: ids(w.secondary) }
}
