/** Shapes of data/anatomy/learn.json, produced by tools/anatomy/merge.ts and read by lib/learn.ts. */

export type Kind = "muscle" | "bone" | "vessel" | "nerve" | "organ" | "other"
export type SystemId = "muscles" | "skeleton" | "heart" | "breathing" | "nerves"
export type Role = "agonist" | "antagonist" | "synergist" | "stabilizer"

export type Structure = {
  id: string
  label: string
  system: SystemId
  kind: Kind
  definition?: { text: string; source: "Z-Anatomy"; license: "CC-BY-SA-4.0" }
  coachNote?: string
  /** sceneId -> glTF node names (both sides) that draw this structure in that scene. */
  nodes: Record<string, string[]>
}

export type SceneFile = { path: string; bytes: number; sha256: string }

export type Layer = { id: string; label: string; structures: string[]; defaultOn: boolean }

export type Movement = {
  id: string
  label: string
  range: [number, number]
  pivot: [number, number, number]
  axis: [number, number, number]
  sign: 1 | -1
  roles: Record<string, Role>
  coachNote?: string
}

export type Scene = {
  id: string
  kind: "joint" | "system"
  title: string
  blurb: string
  file: SceneFile
  structures: string[]
  layers?: Layer[]
  movement?: Movement
}

export type Learn = {
  generatedAt: string
  license: string
  scenes: Scene[]
  structures: Record<string, Structure>
}

/** data/anatomy/authored/scenes.json entries. */
export type AuthoredScene = {
  id: string
  kind: "joint" | "system"
  title: string
  blurb: string
  movement?: { label: string; coachNote?: string }
  layers?: Layer[]
}

export type AuthoredRoles = Record<string, { range: [number, number]; roles: Record<string, Role> }>
