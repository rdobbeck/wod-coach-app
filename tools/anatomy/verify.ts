import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Learn } from "../../lib/learn-types"
import { readGlbJson, triangleCount } from "./glb"

/** Bytes per scene file, from the spec. */
export const BUDGET = { joint: 1_200_000, system: 3_000_000 } as const

export function verifyLearn(learn: Learn, opts: { bytesOf: (path: string) => number | null; missing: Record<string, string[]> }): string[] {
  const errors: string[] = []
  for (const s of learn.scenes) {
    const bytes = opts.bytesOf(s.file.path)
    if (bytes === null) errors.push(`${s.id}: file ${s.file.path} not found`)
    else if (bytes > BUDGET[s.kind]) errors.push(`${s.id}: ${bytes} bytes is over budget (${BUDGET[s.kind]})`)
    if (s.structures.length === 0) errors.push(`${s.id}: no structures`)
    for (const id of s.structures) if (!learn.structures[id]) errors.push(`${s.id}: lists ${id}, which has no structure record`)
    for (const name of opts.missing[s.id] ?? []) errors.push(`${s.id}: allowlist name "${name}" matched nothing in the source`)
    if (s.kind === "joint" && !s.movement) errors.push(`${s.id}: joint scene without a movement`)
  }
  return errors
}

function main() {
  const root = join(__dirname, "..", "..")
  const learn = JSON.parse(readFileSync(join(root, "data", "anatomy", "learn.json"), "utf8")) as Learn
  // The committed build inputs carry each system's unmatched allowlist names, so this check never depends on .work.
  const inputs = JSON.parse(readFileSync(join(root, "data", "anatomy", "generated", "inputs.json"), "utf8")) as { systemIndex: Record<string, { missing: string[] }> }
  const missing: Record<string, string[]> = {}
  for (const [id, idx] of Object.entries(inputs.systemIndex)) missing[id] = idx.missing
  const errors = verifyLearn(learn, {
    bytesOf: (p) => (existsSync(join(root, "public", p)) ? statSync(join(root, "public", p)).size : null),
    missing,
  })
  for (const s of learn.scenes) {
    const p = join(root, "public", s.file.path)
    if (existsSync(p)) console.log(`${s.id.padEnd(10)} ${String(s.file.bytes).padStart(9)} bytes  ${triangleCount(readGlbJson(p)).toLocaleString().padStart(11)} tris  ${s.structures.length} structures`)
  }
  if (errors.length) {
    for (const e of errors) console.error("✗", e)
    process.exit(1)
  }
  console.log("verify: ok")
}

if (process.argv[1]?.endsWith("verify.ts")) main()
