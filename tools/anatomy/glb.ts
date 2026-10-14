import { readFileSync } from "node:fs"

/** The parts of the glTF JSON chunk the pipeline reads. */
export type GlbJson = {
  nodes?: { name?: string; mesh?: number; skin?: number; children?: number[] }[]
  meshes?: { name?: string; primitives: { indices?: number; attributes: Record<string, number>; targets?: unknown[] }[] }[]
  accessors?: { count: number }[]
  skins?: unknown[]
}

const MAGIC = 0x46546c67 // 'glTF'
const JSON_CHUNK = 0x4e4f534a // 'JSON'

/** Parses only the JSON chunk of a .glb; the binary payload is never read into memory twice. */
export function readGlbJson(path: string): GlbJson {
  const buf = readFileSync(path)
  if (buf.length < 20 || buf.readUInt32LE(0) !== MAGIC) throw new Error(`${path}: not a GLB`)
  const len = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== JSON_CHUNK) throw new Error(`${path}: first chunk is not JSON`)
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8")) as GlbJson
}

export const nodeNames = (j: GlbJson) => (j.nodes ?? []).map((n) => n.name ?? "").filter(Boolean)

/**
 * The structure names that draw something: for every node with a mesh, the name of the nearest
 * named ancestor (itself first). glTF-Transform's quantizer parks a mesh on an unnamed child node
 * when the named node also has children, which Z-Anatomy's vessel trees do.
 */
export function meshNodeNames(j: GlbJson): string[] {
  const nodes = j.nodes ?? []
  const parent = new Map<number, number>()
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)))
  const out: string[] = []
  nodes.forEach((n, i) => {
    if (n.mesh === undefined) return
    let k: number | undefined = i
    while (k !== undefined && !nodes[k].name) k = parent.get(k)
    const name = k === undefined ? "" : nodes[k].name ?? ""
    if (name && !out.includes(name)) out.push(name)
  })
  return out
}

export function triangleCount(j: GlbJson) {
  let t = 0
  for (const m of j.meshes ?? [])
    for (const p of m.primitives) if (p.indices !== undefined) t += Math.floor((j.accessors?.[p.indices]?.count ?? 0) / 3)
  return t
}
