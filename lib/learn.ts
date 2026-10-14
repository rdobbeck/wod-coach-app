import learnJson from "../data/anatomy/learn.json"
import type { Learn, Scene, Structure } from "./learn-types"

/**
 * Learn section data. learn.json is produced by `npm run anatomy:build`
 * (tools/anatomy/merge.ts) and committed; nothing here touches the database.
 */
const data = learnJson as unknown as Learn

/** Where the public pages send people who want to train. */
export const LEARN_CTA_URL = "https://ryandobbeck.com"

/** One line of attribution shown under every scene. */
export const CREDITS_LINE =
  "3D model: Z-Anatomy, CC BY-SA 4.0, based on BodyParts3D by the Database Center for Life Science, CC BY 4.0. Definitions from Wikipedia via Z-Anatomy."

export const getScenes = () => data.scenes
export const getJointScenes = () => data.scenes.filter((s) => s.kind === "joint")
export const getSystemScenes = () => data.scenes.filter((s) => s.kind === "system")
export const getScene = (id: string): Scene | null => data.scenes.find((s) => s.id === id) ?? null
export const getStructure = (id: string): Structure | null => data.structures[id] ?? null

/** Only the structures a scene draws, so a page carries no more than it shows. */
export function structuresFor(scene: Scene): Record<string, Structure> {
  const out: Record<string, Structure> = {}
  for (const id of scene.structures) if (data.structures[id]) out[id] = data.structures[id]
  return out
}
