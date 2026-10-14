import { readdirSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { Learn } from "../../lib/learn-types"

const HASHED = /^[a-z0-9-]+\.[0-9a-f]{8}\.glb$/

/** Hashed scene files in public/anatomy that learn.json no longer points at. */
export function staleFiles(existing: string[], referenced: string[]): string[] {
  const keep = new Set(referenced.map((p) => p.split("/").pop()))
  return existing.filter((f) => HASHED.test(f) && !keep.has(f))
}

/** Runs after merge and verify pass, so a failed build never deletes the files the current learn.json uses. */
function main() {
  const root = join(__dirname, "..", "..")
  const dir = join(root, "public", "anatomy")
  const learn = JSON.parse(readFileSync(join(root, "data", "anatomy", "learn.json"), "utf8")) as Learn
  const stale = staleFiles(readdirSync(dir), learn.scenes.map((s) => s.file.path))
  for (const f of stale) unlinkSync(join(dir, f))
  console.log(stale.length ? `pruned ${stale.join(", ")}` : "prune: nothing stale")
}

if (process.argv[1]?.endsWith("prune.ts")) main()
