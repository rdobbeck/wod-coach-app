import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { baseName, labelFrom, slugify } from "../../lib/learn-slug"
import { noLongDashes } from "../../lib/text"
import type { AuthoredRoles, AuthoredScene, Kind, Learn, Scene, Structure, SystemId } from "../../lib/learn-types"
import { meshNodeNames, readGlbJson } from "./glb"

export type MergeInputs = {
  files: Record<string, { kind: "region" | "system"; path: string; bytes: number; sha256: string }>
  nodesByScene: Record<string, string[]>
  regionIndex: Record<string, { bones: string[]; muscles: string[]; attach: string[] }>
  regionMeta: Record<string, { pivot: number[]; axis: number[]; sign: number }>
  systemIndex: Record<string, { objects: { name: string; kind: Kind }[]; missing: string[] }>
  definitions: Record<string, string>
  authored: { scenes: AuthoredScene[]; roles: AuthoredRoles; coachNotes: Record<string, string> }
  now?: string
}

const LICENSE = "Geometry and definitions CC BY-SA 4.0: Z-Anatomy (from BodyParts3D © DBCLS, CC BY 4.0), region method maikleonhg/atlas. See public/anatomy/LICENSE.md."
const DEFINITION_MAX = 600

const ROLES = new Set(["agonist", "antagonist", "synergist", "stabilizer"])
const IPA = /[ˈˌːæðŋɔəɛɪʃʊʌʒθɑɒɜ]/

/** Wikipedia residue Z-Anatomy keeps: empty "()", pronunciation strings, trailing links, "(, pl. …)". */
export function cleanDefinition(text: string) {
  return text
    .replace(/\s*https?:\/\/\S+/g, "")
    .replace(/\s*\(\/[^)]*\/\)/g, "")
    .replace(/\s*\/[^/\s][^/]{0,80}\//g, (m) => (IPA.test(m) ? "" : m))
    .replace(/\s*\(\s*\)/g, "")
    .replace(/\(\s*,\s*/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
}

/** The definitions the scenes actually draw, keyed by base name: what the committed inputs need. */
export function selectDefinitions(definitions: Record<string, string>, nodesByScene: Record<string, string[]>) {
  const out: Record<string, string> = {}
  for (const names of Object.values(nodesByScene))
    for (const n of names) {
      const b = baseName(n)
      if (definitions[b] !== undefined) out[b] = definitions[b]
    }
  return out
}

function checkRoles(sceneId: string, r: AuthoredRoles[string]) {
  const [min, max] = Array.isArray(r.range) ? r.range : []
  const ok = Array.isArray(r.range) && r.range.length === 2 && typeof min === "number" && typeof max === "number" && min >= 0 && min < max && max <= 180
  if (!ok) throw new Error(`${sceneId}: range must be two numbers from 0 to 180, smallest first (got ${JSON.stringify(r.range)})`)
  for (const [id, role] of Object.entries(r.roles))
    if (!ROLES.has(role)) throw new Error(`${sceneId}: role for ${id} is "${role}"; use agonist, antagonist, synergist or stabilizer`)
}

/** Cuts at the last sentence end that fits; falls back to a hard cut with an ellipsis. */
export function clipDefinition(text: string, max = DEFINITION_MAX) {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const end = Math.max(head.lastIndexOf(". "), head.endsWith(".") ? head.length - 1 : -1)
  return end >= 0 ? head.slice(0, end + 1) : head.trimEnd() + "…"
}

function systemFor(kind: Kind, scene: AuthoredScene): SystemId {
  if (kind === "bone") return "skeleton"
  if (kind === "muscle") return "muscles"
  if (kind === "vessel") return "heart"
  if (kind === "nerve") return "nerves"
  return scene.kind === "system" ? (scene.id as SystemId) : "muscles"
}

export function mergeLearn(i: MergeInputs): Learn {
  const structures: Record<string, Structure> = {}
  const scenes: Scene[] = []

  for (const a of i.authored.scenes) {
    const file = i.files[a.id]
    if (!file) throw new Error(`no built file for scene ${a.id}`)
    const nodes = i.nodesByScene[a.id] ?? []
    const kindOf = (name: string): Kind | "attach" | null => {
      if (a.kind === "joint") {
        const idx = i.regionIndex[a.id]
        if (!idx) throw new Error(`no region index for ${a.id}`)
        if (idx.attach.includes(name)) return "attach"
        if (idx.bones.includes(name)) return "bone"
        if (idx.muscles.includes(name)) return "muscle"
        return null
      }
      return i.systemIndex[a.id]?.objects.find((o) => o.name === name)?.kind ?? null
    }
    const ids = new Set<string>()
    for (const name of nodes) {
      const kind = kindOf(name)
      if (kind === null || kind === "attach") continue
      const id = slugify(name)
      const s = (structures[id] ??= { id, label: labelFrom(baseName(name)), system: systemFor(kind, a), kind, nodes: {} })
      ;(s.nodes[a.id] ??= []).push(name)
      ids.add(id)
    }
    const ordered = Array.from(ids).sort((x, y) => structures[x].label.localeCompare(structures[y].label))
    const scene: Scene = { id: a.id, kind: a.kind, title: a.title, blurb: noLongDashes(a.blurb), file: { path: file.path, bytes: file.bytes, sha256: file.sha256 }, structures: ordered }

    if (a.kind === "joint") {
      const meta = i.regionMeta[a.id]
      const roles = i.authored.roles[a.id]
      if (!meta || !roles || !a.movement) throw new Error(`joint scene ${a.id} needs meta, roles and an authored movement label`)
      checkRoles(a.id, roles)
      for (const id of Object.keys(roles.roles)) if (!ids.has(id)) throw new Error(`role for ${id} but scene ${a.id} does not draw it`)
      scene.movement = {
        id: "flex", label: a.movement.label, range: roles.range,
        pivot: meta.pivot as [number, number, number], axis: meta.axis as [number, number, number], sign: meta.sign < 0 ? -1 : 1,
        roles: roles.roles, ...(a.movement.coachNote ? { coachNote: noLongDashes(a.movement.coachNote) } : {}),
      }
    }
    if (a.layers) {
      for (const l of a.layers) for (const id of l.structures) if (!ids.has(id)) throw new Error(`layer ${l.id} in ${a.id} names ${id}, which the scene does not draw`)
      scene.layers = a.layers
    }
    scenes.push(scene)
  }

  for (const s of Object.values(structures)) {
    const first = Object.values(s.nodes)[0]?.[0]
    const text = first ? i.definitions[baseName(first)] : undefined
    if (text) s.definition = { text: clipDefinition(noLongDashes(cleanDefinition(text))), source: "Z-Anatomy", license: "CC-BY-SA-4.0" }
  }
  for (const [id, note] of Object.entries(i.authored.coachNotes)) {
    if (!structures[id]) throw new Error(`coach note for unknown structure ${id}`)
    structures[id].coachNote = noLongDashes(note)
  }
  return { generatedAt: i.now ?? new Date().toISOString(), license: LICENSE, scenes, structures }
}

/** What the pipeline hands merge, committed so authored edits never need Blender: data/anatomy/generated/inputs.json. */
export type BuildInputs = Pick<MergeInputs, "files" | "regionIndex" | "regionMeta" | "systemIndex" | "definitions">

const ROOT = join(__dirname, "..", "..")
const INPUTS = join(ROOT, "data", "anatomy", "generated", "inputs.json")
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"))

/** Reads the hashed GLBs in public/ for the node names each scene draws. */
function nodesFor(files: MergeInputs["files"]) {
  const out: Record<string, string[]> = {}
  for (const [id, f] of Object.entries(files)) out[id] = meshNodeNames(readGlbJson(join(ROOT, "public", f.path)))
  return out
}

/** After a Blender build: gathers .work output into the committed inputs file. */
function collect() {
  const work = join(__dirname, ".work")
  if (!existsSync(join(work, "files.json"))) throw new Error("run compress.sh first")
  const files = read(join(work, "files.json")) as MergeInputs["files"]
  const inputs: BuildInputs = { files, regionIndex: {}, regionMeta: {}, systemIndex: {}, definitions: {} }
  for (const [id, f] of Object.entries(files)) {
    if (f.kind === "region") {
      inputs.regionIndex[id] = read(join(work, "regions", `${id}.index.json`))
      inputs.regionMeta[id] = read(join(work, "regions", `${id}.meta.json`))
    } else inputs.systemIndex[id] = read(join(work, "systems", `${id}.index.json`))
  }
  inputs.definitions = selectDefinitions(read(join(work, "definitions.json")), nodesFor(files))
  mkdirSync(join(ROOT, "data", "anatomy", "generated"), { recursive: true })
  writeFileSync(INPUTS, JSON.stringify(inputs, null, 1))
}

/** Committed inputs + Ryan's authored files -> generated/ and learn.json. */
function main() {
  if (!existsSync(INPUTS)) throw new Error(`${INPUTS} is missing: run npm run anatomy:build once`)
  const inputs = read(INPUTS) as BuildInputs
  const authoredDir = join(ROOT, "data", "anatomy", "authored")
  const out = mergeLearn({
    ...inputs,
    nodesByScene: nodesFor(inputs.files),
    authored: { scenes: read(join(authoredDir, "scenes.json")), roles: read(join(authoredDir, "roles.json")), coachNotes: read(join(authoredDir, "coach-notes.json")) },
  })
  const gen = join(ROOT, "data", "anatomy", "generated")
  writeFileSync(join(gen, "structures.json"), JSON.stringify(out.structures, null, 1))
  writeFileSync(join(gen, "scenes.json"), JSON.stringify(out.scenes, null, 1))
  writeFileSync(join(ROOT, "data", "anatomy", "learn.json"), JSON.stringify(out))
  console.log(`merged ${out.scenes.length} scenes, ${Object.keys(out.structures).length} structures`)
}

if (process.argv[1]?.endsWith("merge.ts")) {
  if (process.argv.includes("--collect")) collect()
  main()
}
