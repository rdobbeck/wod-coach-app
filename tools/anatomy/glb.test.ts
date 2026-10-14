import test from "node:test"
import assert from "node:assert/strict"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { meshNodeNames, nodeNames, readGlbJson, triangleCount } from "./glb"

/** Builds a tiny valid GLB (JSON chunk only) so the reader can be tested without Blender. */
function writeFixture(path: string) {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    nodes: [{ name: "Rig" }, { name: "Femur.r", mesh: 0 }, { name: "Rectus femoris muscle.r", mesh: 1 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] },
      { primitives: [{ attributes: { POSITION: 0 }, indices: 2 }] },
    ],
    accessors: [{ count: 3 }, { count: 9 }, { count: 300 }],
  })
  const jsonBuf = Buffer.from(json.padEnd(json.length + ((4 - (json.length % 4)) % 4), " "), "utf8")
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0) // 'glTF'
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length, 8)
  const chunk = Buffer.alloc(8)
  chunk.writeUInt32LE(jsonBuf.length, 0)
  chunk.writeUInt32LE(0x4e4f534a, 4) // 'JSON'
  writeFileSync(path, Buffer.concat([header, chunk, jsonBuf]))
}

test("reads names and counts triangles from the JSON chunk", () => {
  mkdirSync(join(__dirname, "fixtures"), { recursive: true })
  const p = join(__dirname, "fixtures", "two-nodes.glb")
  writeFixture(p)
  const j = readGlbJson(p)
  assert.deepEqual(nodeNames(j), ["Rig", "Femur.r", "Rectus femoris muscle.r"])
  assert.deepEqual(meshNodeNames(j), ["Femur.r", "Rectus femoris muscle.r"])
  assert.equal(triangleCount(j), 3 + 100)
})

test("a mesh on an unnamed child node counts for its nearest named ancestor, once", () => {
  // glTF-Transform's quantizer moves a mesh onto an unnamed child when the named node also has children.
  const j = {
    nodes: [
      { name: "Left coronary artery", children: [1, 2] },
      { name: "Circumflex artery of heart", mesh: 0 },
      { mesh: 1 },
      { mesh: 2 }, // unnamed and unparented: nothing to attribute it to
    ],
    meshes: [{ primitives: [] }, { primitives: [] }, { primitives: [] }],
  }
  assert.deepEqual(meshNodeNames(j), ["Circumflex artery of heart", "Left coronary artery"])
})

test("rejects a file that is not a GLB", () => {
  const p = join(__dirname, "fixtures", "not.glb")
  writeFileSync(p, "hello")
  assert.throws(() => readGlbJson(p), /not a GLB/)
})
