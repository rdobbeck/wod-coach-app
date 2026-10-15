import test from "node:test"
import assert from "node:assert/strict"
import learn from "../../data/anatomy/learn.json"
import crosswalk from "../../data/anatomy/authored/muscle-groups.json"
import { groupLabel, groupOfStructure, isGroupId, MUSCLE_GROUPS, musclesHref, orderGroups, parseGroups, structuresOf } from "../../lib/muscles/groups"

const muscleScene = new Set((learn as { scenes: { id: string; structures: string[] }[] }).scenes.find((s) => s.id === "muscles")!.structures)

test("every group has structures, every structure exists in the muscles scene, none is in two groups", () => {
  const seen = new Map<string, string>()
  for (const g of MUSCLE_GROUPS) {
    const ids = structuresOf(g.id)
    assert.ok(ids.length > 0, `${g.id} is empty`)
    for (const id of ids) {
      assert.ok(muscleScene.has(id), `${g.id}: ${id} is not in the muscles scene`)
      assert.equal(seen.get(id), undefined, `${id} is in ${seen.get(id)} and ${g.id}`)
      seen.set(id, g.id)
    }
  }
})

test("the crosswalk file and the vocabulary list the same groups", () => {
  assert.deepEqual(Object.keys(crosswalk).sort(), MUSCLE_GROUPS.map((g) => g.id).sort())
})

test("labels read like a gym, with no long dashes", () => {
  assert.equal(groupLabel("side-glutes"), "Side glutes")
  for (const g of MUSCLE_GROUPS) assert.ok(!/[—–]/.test(g.label), g.label)
})

test("a structure knows its group; structures outside every group have none", () => {
  assert.equal(groupOfStructure("vastus-lateralis-muscle"), "quads")
  assert.equal(groupOfStructure("gluteus-maximus-muscle"), "glutes")
  assert.equal(groupOfStructure("frontalis-muscle"), null)
  assert.equal(groupOfStructure("nope"), null)
})

test("group lists are validated, deduped and put in vocabulary order", () => {
  assert.equal(isGroupId("quads"), true)
  assert.equal(isGroupId("quadriceps"), false)
  assert.deepEqual(orderGroups(["hamstrings", "glutes", "nope", "glutes"]), ["glutes", "hamstrings"])
  assert.deepEqual(parseGroups(" hamstrings, glutes ,,foo"), ["glutes", "hamstrings"])
  assert.deepEqual(parseGroups(null), [])
})

test("the Muscles worked link carries both lists and the exercise name", () => {
  assert.equal(
    musclesHref({ primary: ["hamstrings", "glutes"], secondary: ["lower-back"] }, "Romanian Deadlift"),
    "/client/learn/muscles?highlight=glutes%2Chamstrings&also=lower-back&from=Romanian+Deadlift",
  )
  assert.equal(musclesHref({ primary: ["calves"], secondary: [] }, "Calf Raise"), "/client/learn/muscles?highlight=calves&from=Calf+Raise")
})
