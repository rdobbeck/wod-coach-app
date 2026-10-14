import type { Kind, Role, Scene } from "./learn-types"

/**
 * Pure helpers for the Learn viewer. No three.js and no DOM beyond
 * getComputedStyle, so they run in node tests.
 */

type Named = { name: string; userData?: { name?: string }; parent?: Named | null }

/** GLTFLoader rewrites node names (spaces to _, dots removed) and keeps the original in userData. */
export const originalName = (o: { name: string; userData?: { name?: string } }) => o.userData?.name || o.name

/**
 * The Z-Anatomy name a drawn mesh belongs to: its own original name, or the nearest named
 * ancestor's. The compressor parks some meshes on unnamed child nodes (see tools/anatomy/glb.ts).
 */
export function structureNameOf(o: Named): string {
  let cur: Named | null | undefined = o
  while (cur) {
    if (cur.userData?.name) return cur.userData.name
    cur = cur.parent
  }
  return ""
}

/** A tap is pointer-up within `max` px of pointer-down; anything further is a drag. */
export const isTap = (down: [number, number] | null, up: [number, number], max = 6) =>
  !!down && Math.hypot(up[0] - down[0], up[1] - down[1]) <= max

/** A fixed anatomical palette that reads on every app theme. Only the selection highlight follows the theme. */
export const PALETTE = {
  bone: "#e9dfcb",
  muscle: "#b8574c",
  vessel: "#c0392b",
  vein: "#3b6fd6",
  nerve: "#e8c547",
  organ: "#c98b7a",
  other: "#9aa3b2",
} as const

const VEIN_RE = /\b(vein|vena cava|sinus)\b/i

export function kindColor(kind: Kind | null, label: string) {
  if (kind === "vessel") return VEIN_RE.test(label) ? PALETTE.vein : PALETTE.vessel
  return kind ? PALETTE[kind] : PALETTE.other
}

/** Muscle bulge: eased so the first degrees already show, clamped to the range. */
export const morphInfluence = (angle: number, max: number) =>
  max > 0 ? Math.pow(Math.min(Math.max(angle, 0), max) / max, 0.8) : 0

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

export function filterStructures<T extends { label: string }>(items: T[], query: string): T[] {
  const q = fold(query.trim())
  if (!q) return items
  return items.filter((i) => fold(i.label).includes(q))
}

/** Structures to hide given which layers are on; null when nothing is hidden. Structures in no layer always show. */
export function hiddenByLayers(scene: Scene, on: Set<string>): Set<string> | null {
  if (!scene.layers?.length) return null
  const inSome = new Set<string>()
  const inOn = new Set<string>()
  for (const l of scene.layers) for (const id of l.structures) { inSome.add(id); if (on.has(l.id)) inOn.add(id) }
  const hidden = new Set(Array.from(inSome).filter((id) => !inOn.has(id)))
  return hidden.size ? hidden : null
}

export const ROLE_LABEL: Record<Role, string> = {
  agonist: "works the movement",
  antagonist: "opposes it, controls the return",
  synergist: "assists",
  stabilizer: "holds the joint steady",
}

export const KIND_LABEL: Record<Kind, string> = { muscle: "Muscle", bone: "Bone", vessel: "Vessel", nerve: "Nerve", organ: "Organ", other: "Structure" }

/** The app theme's accent, read from the CSS variable; the brand red if it cannot be read. */
export function accentColor(el: Element | null) {
  if (!el || typeof getComputedStyle !== "function") return "#c1272d"
  const v = getComputedStyle(el).getPropertyValue("--app-accent").trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#c1272d"
}
