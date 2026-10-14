import test from "node:test"
import assert from "node:assert/strict"
import { staleFiles } from "./prune"

test("only hashed scene files that learn.json no longer references are stale", () => {
  const existing = ["knee.d5e4a951.glb", "knee.0badc0de.glb", "heart.f13319da.glb", "LICENSE.md", "posters", "notes.glb"]
  const referenced = ["/anatomy/knee.d5e4a951.glb", "/anatomy/heart.f13319da.glb"]
  assert.deepEqual(staleFiles(existing, referenced), ["knee.0badc0de.glb"])
})

test("nothing is stale when every hashed file is referenced", () => {
  assert.deepEqual(staleFiles(["knee.d5e4a951.glb"], ["/anatomy/knee.d5e4a951.glb"]), [])
})
