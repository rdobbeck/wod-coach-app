import { meshNodeNames, nodeNames, readGlbJson, triangleCount } from "./glb"
import { statSync } from "node:fs"

/** Usage: npx tsx tools/anatomy/inspect.ts <file.glb> [--names] */
const [, , file, flag] = process.argv
if (!file) throw new Error("usage: inspect.ts <file.glb> [--names]")
const j = readGlbJson(file)
const names = nodeNames(j)
const meshes = meshNodeNames(j)
const morphs = (j.meshes ?? []).filter((m) => m.primitives.some((p) => p.targets?.length)).length
console.log(JSON.stringify({ bytes: statSync(file).size, nodes: names.length, meshes: meshes.length, skins: j.skins?.length ?? 0, morphMeshes: morphs, triangles: triangleCount(j), hasDistal: names.includes("distal") }))
if (flag === "--names") console.log(meshes.join("\n"))
