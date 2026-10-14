import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { pickMesh, type PickState } from "../../components/learn/pick"

/** A 1 m "shin" hanging from a knee at the origin, skinned to one bone, bounds cached at rest like the viewer does at load. */
function shin() {
  const geo = new THREE.BoxGeometry(0.2, 1, 0.2).translate(0, -0.5, 0)
  const n = geo.attributes.position.count
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4))
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [1, 0, 0, 0]).flat(), 4))
  const bone = new THREE.Bone()
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial())
  mesh.add(bone)
  mesh.bind(new THREE.Skeleton([bone]))
  const root = new THREE.Group()
  root.add(mesh)
  root.updateMatrixWorld(true)
  mesh.computeBoundingBox() // what Box3.setFromObject does when the scene loads
  return { root, mesh, bone }
}

const rayAt = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1))

test("after the joint bends, a tap on the part that moved still picks it", () => {
  const { root, mesh, bone } = shin()
  bone.rotation.z = Math.PI / 2 // the shin swings from pointing down to pointing along +x
  root.updateMatrixWorld(true)
  const state: PickState = { angle: 90, boundsAngle: 0 }
  assert.equal(pickMesh(rayAt(0.5, 0), [mesh], state), mesh)
  assert.equal(state.boundsAngle, 90)
})

test("at rest, a ray that misses the part picks nothing", () => {
  const { mesh } = shin()
  assert.equal(pickMesh(rayAt(0.5, 0), [mesh], { angle: 0, boundsAngle: 0 }), null)
  assert.equal(pickMesh(rayAt(0, -0.5), [mesh], { angle: 0, boundsAngle: 0 }), mesh)
})
