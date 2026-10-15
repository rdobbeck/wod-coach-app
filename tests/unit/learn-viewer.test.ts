import test from "node:test"
import assert from "node:assert/strict"
import { createTapTracker, filterStructures, hiddenByLayers, isTap, kindColor, morphInfluence, originalName, selectionStyle, structureNameOf, PALETTE } from "../../lib/learn-viewer"
import type { Scene } from "../../lib/learn-types"

test("the original glTF name wins over the sanitised one", () => {
  assert.equal(originalName({ name: "Rectus_femoris_muscler", userData: { name: "Rectus femoris muscle.r" } }), "Rectus femoris muscle.r")
  assert.equal(originalName({ name: "distal", userData: {} }), "distal")
})

test("a mesh on an unnamed child resolves to its nearest named ancestor", () => {
  const trunk = { name: "Left_coronary_artery", userData: { name: "Left coronary artery" }, parent: null }
  const unnamed = { name: "", userData: {}, parent: trunk }
  const branch = { name: "Circumflex_artery_of_heart", userData: { name: "Circumflex artery of heart" }, parent: trunk }
  assert.equal(structureNameOf(unnamed), "Left coronary artery")
  assert.equal(structureNameOf(branch), "Circumflex artery of heart")
  assert.equal(structureNameOf({ name: "", userData: {}, parent: null }), "")
})

test("a tap is a pointer that barely moved; a drag is not a tap", () => {
  assert.equal(isTap([10, 10], [14, 13]), true)
  assert.equal(isTap([10, 10], [30, 10]), false)
  assert.equal(isTap(null, [0, 0]), false)
})

test("veins are blue, arteries red, bones off-white", () => {
  assert.equal(kindColor("vessel", "Superior vena cava"), PALETTE.vein)
  assert.equal(kindColor("vessel", "Femoral artery"), PALETTE.vessel)
  assert.equal(kindColor("bone", "Femur"), PALETTE.bone)
  assert.equal(kindColor(null, "anything"), PALETTE.other)
})

test("plural vein names are veins too", () => {
  assert.equal(kindColor("vessel", "Brachial veins"), PALETTE.vein)
  assert.equal(kindColor("vessel", "Inferior vena cava (abdominal part)"), PALETTE.vein)
  assert.equal(kindColor("vessel", "Right pulmonary artery"), PALETTE.vessel)
})

test("nothing selected: every part is opaque and writes depth", () => {
  assert.deepEqual(selectionStyle("femur", "bone", null), { opacity: 1, transparent: false, depthWrite: true, glow: 0 })
  assert.deepEqual(selectionStyle("rectus-femoris-muscle", "muscle", null), { opacity: 1, transparent: false, depthWrite: true, glow: 0 })
})

test("with a selection, other non-bone parts fade and stop writing depth; bone and the selection stay solid", () => {
  assert.deepEqual(selectionStyle("vastus-lateralis-muscle", "muscle", "rectus-femoris-muscle"), { opacity: 0.35, transparent: true, depthWrite: false, glow: 0 })
  assert.deepEqual(selectionStyle("femur", "bone", "rectus-femoris-muscle"), { opacity: 1, transparent: false, depthWrite: true, glow: 0 })
  assert.deepEqual(selectionStyle("rectus-femoris-muscle", "muscle", "rectus-femoris-muscle"), { opacity: 1, transparent: false, depthWrite: true, glow: 1 })
})

test("a Muscles worked highlight lights primary muscles fully and secondary at half, and fades the rest except bone", () => {
  const h = { primary: new Set(["gluteus-maximus-muscle"]), secondary: new Set(["semitendinosus-muscle"]) }
  assert.deepEqual(selectionStyle("gluteus-maximus-muscle", "muscle", null, h), { opacity: 1, transparent: false, depthWrite: true, glow: 1 })
  assert.deepEqual(selectionStyle("semitendinosus-muscle", "muscle", null, h), { opacity: 1, transparent: false, depthWrite: true, glow: 0.5 })
  assert.deepEqual(selectionStyle("vastus-lateralis-muscle", "muscle", null, h), { opacity: 0.35, transparent: true, depthWrite: false, glow: 0 })
  assert.deepEqual(selectionStyle("femur", "bone", null, h), { opacity: 1, transparent: false, depthWrite: true, glow: 0 })
})

test("a selection made on top of a highlight wins, as a selection always has", () => {
  const h = { primary: new Set(["gluteus-maximus-muscle"]), secondary: new Set<string>() }
  assert.deepEqual(selectionStyle("vastus-lateralis-muscle", "muscle", "vastus-lateralis-muscle", h), { opacity: 1, transparent: false, depthWrite: true, glow: 1 })
  assert.deepEqual(selectionStyle("gluteus-maximus-muscle", "muscle", "vastus-lateralis-muscle", h), { opacity: 0.35, transparent: true, depthWrite: false, glow: 0 })
})

test("a single short press is a tap", () => {
  const t = createTapTracker()
  t.down(1, 100, 100, true)
  t.move(1, 103, 102)
  assert.equal(t.up(1, 104, 103), true)
})

test("a drag that wanders and comes back is not a tap", () => {
  const t = createTapTracker()
  t.down(1, 100, 100, true)
  t.move(1, 140, 100)
  t.move(1, 102, 100)
  assert.equal(t.up(1, 101, 100), false)
})

test("a pinch is never a tap, even when one finger stays put; the next single press works again", () => {
  const t = createTapTracker()
  t.down(1, 100, 100, true)
  t.down(2, 200, 200, true)
  t.move(2, 260, 260)
  assert.equal(t.up(1, 100, 100), false)
  assert.equal(t.up(2, 260, 260), false)
  t.down(3, 50, 50, true)
  assert.equal(t.up(3, 51, 50), true)
})

test("right and middle clicks are not taps; a cancelled pointer is not a tap", () => {
  const t = createTapTracker()
  t.down(1, 10, 10, false)
  assert.equal(t.up(1, 10, 10), false)
  t.down(2, 10, 10, true)
  t.cancel(2)
  assert.equal(t.up(2, 10, 10), false)
})

test("morph influence eases from 0 to 1 across the range and clamps", () => {
  assert.equal(morphInfluence(0, 130), 0)
  assert.equal(morphInfluence(130, 130), 1)
  assert.equal(morphInfluence(200, 130), 1)
  assert.ok(morphInfluence(65, 130) > 0.5)
  assert.equal(morphInfluence(10, 0), 0)
})

test("search ignores case and accents and matches inside the label", () => {
  const items = [{ id: "a", label: "Gluteus maximus" }, { id: "b", label: "Rectus femoris" }, { id: "c", label: "Fémur" }]
  assert.deepEqual(filterStructures(items, "FEM").map((i) => i.id), ["b", "c"])
  assert.deepEqual(filterStructures(items, "  ").map((i) => i.id), ["a", "b", "c"])
})

test("layer toggles hide only structures whose every layer is off", () => {
  const scene = {
    id: "heart", kind: "system", title: "", blurb: "", file: { path: "", bytes: 0, sha256: "" },
    structures: ["left-ventricle", "femoral-artery", "coronary-sinus", "unlayered"],
    layers: [
      { id: "heart", label: "Heart", defaultOn: true, structures: ["left-ventricle", "coronary-sinus"] },
      { id: "veins", label: "Veins", defaultOn: true, structures: ["coronary-sinus"] },
      { id: "arteries", label: "Arteries", defaultOn: true, structures: ["femoral-artery"] },
    ],
  } as Scene
  assert.equal(hiddenByLayers(scene, new Set(["heart", "veins", "arteries"])), null)
  assert.deepEqual(Array.from(hiddenByLayers(scene, new Set(["heart"]))!).sort(), ["femoral-artery"])
  assert.deepEqual(Array.from(hiddenByLayers(scene, new Set())!).sort(), ["coronary-sinus", "femoral-artery", "left-ventricle"])
  assert.equal(hiddenByLayers({ ...scene, layers: undefined }, new Set()), null)
})
