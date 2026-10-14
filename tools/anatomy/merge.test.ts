import test from "node:test"
import assert from "node:assert/strict"
import { mergeLearn, clipDefinition, cleanDefinition, selectDefinitions, type MergeInputs } from "./merge"

function inputs(over: Partial<MergeInputs> = {}): MergeInputs {
  return {
    files: {
      knee: { kind: "region", path: "/anatomy/knee.abcd1234.glb", bytes: 700000, sha256: "abcd1234" },
      muscles: { kind: "system", path: "/anatomy/muscles.ffff0000.glb", bytes: 2000000, sha256: "ffff0000" },
    },
    nodesByScene: {
      knee: ["Femur.r", "Tibia.r", "Rectus femoris muscle.r", "Long head of biceps femoris.r", "Rectus femoris muscle.or"],
      muscles: ["Rectus femoris muscle.r", "Rectus femoris muscle.l", "Diaphragm"],
    },
    regionIndex: { knee: { bones: ["Femur.r", "Tibia.r"], muscles: ["Rectus femoris muscle.r", "Long head of biceps femoris.r"], attach: ["Rectus femoris muscle.or"] } },
    regionMeta: { knee: { pivot: [0, 0.44, 0], axis: [-1, 0, 0], sign: -1 } },
    systemIndex: { muscles: { objects: [{ name: "Rectus femoris muscle.r", kind: "muscle" }, { name: "Rectus femoris muscle.l", kind: "muscle" }, { name: "Diaphragm", kind: "muscle" }], missing: [] } },
    definitions: { "Rectus femoris muscle": "The quadriceps femoris muscle — also called the quads — is big. It extends the knee. Third sentence.", Femur: "The femur is the thigh bone." },
    authored: {
      scenes: [
        { id: "knee", kind: "joint", title: "Knee", blurb: "Bend it.", movement: { label: "Knee flexion" } },
        { id: "muscles", kind: "system", title: "Muscles", blurb: "All of them.", layers: [{ id: "legs", label: "Legs", defaultOn: true, structures: ["rectus-femoris-muscle"] }] },
      ],
      roles: { knee: { range: [0, 130], roles: { "long-head-of-biceps-femoris": "agonist", "rectus-femoris-muscle": "antagonist" } } },
      coachNotes: { "rectus-femoris-muscle": "Crosses the hip too — watch the pelvis." },
    },
    now: "2026-10-14T00:00:00.000Z",
    ...over,
  }
}

test("structures are keyed by slug, sides merge, attachments are skipped", () => {
  const out = mergeLearn(inputs())
  const rf = out.structures["rectus-femoris-muscle"]
  assert.equal(rf.label, "Rectus femoris")
  assert.equal(rf.kind, "muscle")
  assert.equal(rf.system, "muscles")
  assert.deepEqual(rf.nodes, { knee: ["Rectus femoris muscle.r"], muscles: ["Rectus femoris muscle.r", "Rectus femoris muscle.l"] })
  assert.equal(out.structures["rectus-femoris-muscle-or"], undefined)
  assert.equal(out.structures["femur"].system, "skeleton")
  const knee = out.scenes.find((s) => s.id === "knee")!
  assert.deepEqual(knee.structures, ["femur", "long-head-of-biceps-femoris", "rectus-femoris-muscle", "tibia"])
})

test("joint scenes carry the movement from meta, roles and authored label", () => {
  const knee = mergeLearn(inputs()).scenes[0]
  assert.equal(knee.movement?.label, "Knee flexion")
  assert.deepEqual(knee.movement?.range, [0, 130])
  assert.equal(knee.movement?.sign, -1)
  assert.deepEqual(knee.movement?.axis, [-1, 0, 0])
  assert.equal(knee.movement?.roles["rectus-femoris-muscle"], "antagonist")
})

test("definitions and coach notes lose their long dashes; definitions are clipped at a sentence", () => {
  const rf = mergeLearn(inputs()).structures["rectus-femoris-muscle"]
  assert.equal(rf.coachNote, "Crosses the hip too, watch the pelvis.")
  assert.ok(!/[—–]/.test(rf.definition!.text))
  assert.equal(rf.definition!.source, "Z-Anatomy")
  assert.equal(clipDefinition("One. Two. Three.", 9), "One. Two.")
  assert.equal(clipDefinition("Short.", 600), "Short.")
})

test("a coach note for an unknown structure fails the merge by name", () => {
  assert.throws(() => mergeLearn(inputs({ authored: { ...inputs().authored, coachNotes: { "left-pinky": "x" } } })), /coach note.*left-pinky/)
})

test("a layer naming a structure the scene does not draw fails by name", () => {
  const a = inputs().authored
  a.scenes[1].layers = [{ id: "x", label: "X", defaultOn: true, structures: ["femur"] }]
  assert.throws(() => mergeLearn(inputs({ authored: a })), /layer x.*femur/)
})

test("a role for a structure the joint scene does not draw fails by name", () => {
  const a = inputs().authored
  a.roles.knee.roles["diaphragm"] = "synergist"
  assert.throws(() => mergeLearn(inputs({ authored: a })), /role.*diaphragm/)
})

test("a role outside the four values fails the merge by scene and slug", () => {
  const a = inputs().authored
  a.roles.knee.roles["rectus-femoris-muscle"] = "stabiliser" as never
  assert.throws(() => mergeLearn(inputs({ authored: a })), /knee.*rectus-femoris-muscle.*stabiliser/)
})

test("a range that is not two increasing numbers from 0 to 180 fails by scene", () => {
  for (const range of [[130, 0], [0, 200], ["0", 130], [0], [-5, 90]]) {
    const a = inputs().authored
    a.roles.knee.range = range as never
    assert.throws(() => mergeLearn(inputs({ authored: a })), /knee.*range/, JSON.stringify(range))
  }
})

test("definitions lose empty parentheses, pronunciation strings and trailing links", () => {
  assert.equal(cleanDefinition("The semimembranosus muscle () is the most medial."), "The semimembranosus muscle is the most medial.")
  assert.equal(cleanDefinition("The obliquus capitis inferior muscle (/əˈblaɪkwəs ˈkæpɪtɪs/) is the larger."), "The obliquus capitis inferior muscle is the larger.")
  assert.equal(cleanDefinition("The arytenoid muscle /ærɪˈtiːnɔɪd/ is a single muscle."), "The arytenoid muscle is a single muscle.")
  assert.equal(cleanDefinition("It joins the sternum. https://en.wikipedia.org/wiki/Pectoralis_major"), "It joins the sternum.")
  assert.equal(cleanDefinition("The femur (, pl. femurs or femora ), or thigh bone, is long."), "The femur (pl. femurs or femora), or thigh bone, is long.")
  assert.equal(cleanDefinition("Flexes and/or rotates the hip (see below)."), "Flexes and/or rotates the hip (see below).")
})

test("the committed inputs keep only definitions for structures a scene draws", () => {
  assert.deepEqual(
    selectDefinitions({ Femur: "a", "Rectus femoris muscle": "b", Pons: "c" }, { knee: ["Femur.r", "Rectus femoris muscle.r"] }),
    { Femur: "a", "Rectus femoris muscle": "b" },
  )
})

test("a scene with no built file fails by name", () => {
  const i = inputs()
  delete i.files.muscles
  assert.throws(() => mergeLearn(i), /no built file.*muscles/)
})
