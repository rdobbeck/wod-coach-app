import test from "node:test"
import assert from "node:assert/strict"
import { getJointScenes, getScene, getScenes, getSystemScenes, structuresFor, LEARN_CTA_URL } from "../../lib/learn"

test("learn.json is loaded and split by kind", () => {
  assert.equal(getScenes().length, 11)
  assert.deepEqual(getJointScenes().map((s) => s.id), ["knee", "hip", "shoulder", "elbow", "lumbar", "neck"])
  assert.deepEqual(getSystemScenes().map((s) => s.id), ["muscles", "skeleton", "heart", "breathing", "nerves"])
  assert.equal(getScene("nope"), null)
})

test("a scene's structures subset is complete and nothing more", () => {
  const knee = getScene("knee")!
  const subset = structuresFor(knee)
  assert.deepEqual(Object.keys(subset).sort(), [...knee.structures].sort())
  assert.ok(subset["rectus-femoris-muscle"].definition?.text.startsWith("The quadriceps"))
})

test("the call to action goes to Ryan's site", () => {
  assert.equal(LEARN_CTA_URL, "https://ryandobbeck.com")
})
