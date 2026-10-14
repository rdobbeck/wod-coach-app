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

test("the heart scene brings the blood back: great veins, all four pulmonary veins and the limb veins", () => {
  const heart = getScene("heart")!
  const want = [
    "inferior-vena-cava-thoracic-part", "inferior-vena-cava-abdominal-part", "superior-vena-cava", "right-pulmonary-artery",
    "right-superior-pulmonary-vein", "right-inferior-pulmonary-vein", "left-superior-pulmonary-vein", "left-inferior-pulmonary-vein",
    "right-subclavian-vein", "axillary-vein", "cephalic-vein", "basilic-vein", "femoral-vein", "great-saphenous-vein", "popliteal-vein",
  ]
  for (const id of want) assert.ok(heart.structures.includes(id), id)
  const veins = heart.layers!.find((l) => l.id === "veins")!
  for (const id of ["femoral-vein", "inferior-vena-cava-abdominal-part"]) assert.ok(veins.structures.includes(id), `veins layer: ${id}`)
})

test("no shipped definition carries empty parentheses, raw links or pronunciation strings", () => {
  for (const scene of getScenes())
    for (const s of Object.values(structuresFor(scene))) {
      const t = s.definition?.text ?? ""
      assert.ok(!/\(\s*\)|https?:\/\/|\/[^/\s][^/]*[ˈˌːæðŋɔəɛɪʃʊʌʒθ][^/]*\//.test(t), `${s.id}: ${t.slice(0, 90)}`)
    }
})
