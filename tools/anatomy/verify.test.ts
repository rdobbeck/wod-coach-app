import test from "node:test"
import assert from "node:assert/strict"
import { BUDGET, verifyLearn } from "./verify"
import type { Learn } from "../../lib/learn-types"

function learn(): Learn {
  return {
    generatedAt: "2026-10-14T00:00:00.000Z", license: "x",
    scenes: [
      { id: "knee", kind: "joint", title: "Knee", blurb: "", file: { path: "/anatomy/knee.a.glb", bytes: 700000, sha256: "a" }, structures: ["femur"], movement: { id: "flex", label: "Knee flexion", range: [0, 130], pivot: [0, 0, 0], axis: [1, 0, 0], sign: 1, roles: {} } },
      { id: "muscles", kind: "system", title: "Muscles", blurb: "", file: { path: "/anatomy/muscles.b.glb", bytes: 2000000, sha256: "b" }, structures: ["femur"] },
    ],
    structures: { femur: { id: "femur", label: "Femur", system: "skeleton", kind: "bone", nodes: { knee: ["Femur.r"], muscles: ["Femur.r"] } } },
  }
}
const ok = { bytesOf: (p: string) => (p.includes("knee") ? 700000 : 2000000), missing: {} }

test("a clean build has no errors", () => {
  assert.deepEqual(verifyLearn(learn(), ok), [])
})

test("budgets are enforced per scene kind", () => {
  const errs = verifyLearn(learn(), { ...ok, bytesOf: (p) => (p.includes("knee") ? BUDGET.joint + 1 : BUDGET.system + 1) })
  assert.equal(errs.length, 2)
  assert.match(errs[0], /knee.*over budget/)
  assert.match(errs[1], /muscles.*over budget/)
})

test("a missing file and a missing allowlist name are reported by name", () => {
  const errs = verifyLearn(learn(), { bytesOf: () => null, missing: { muscles: ["Gluteus minimus muscle"] } })
  assert.ok(errs.some((e) => /knee.*not found/.test(e)))
  assert.ok(errs.some((e) => /muscles.*Gluteus minimus muscle/.test(e)))
})

test("an empty scene and a dangling structure reference are errors", () => {
  const l = learn()
  l.scenes[1].structures = []
  l.scenes[0].structures = ["tibia"]
  const errs = verifyLearn(l, ok)
  assert.ok(errs.some((e) => /muscles.*no structures/.test(e)))
  assert.ok(errs.some((e) => /knee.*tibia/.test(e)))
})
