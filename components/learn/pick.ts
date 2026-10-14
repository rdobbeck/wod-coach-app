import type * as THREE from "three"

/** The pose the cached bounds were last computed at; null means never. */
export type PickState = { angle: number; boundsAngle: number | null }

/**
 * Nearest mesh under the ray. three tests a skinned mesh against bounds it cached the first time
 * they were asked for (here: the rest pose at load), so after the joint moves, rays at the moved
 * part miss. Recompute the skinned meshes' bounds once per pose before casting.
 */
export function pickMesh(ray: THREE.Raycaster, meshes: THREE.Object3D[], state: PickState): THREE.Object3D | null {
  if (state.boundsAngle !== state.angle) {
    for (const m of meshes) {
      const s = m as THREE.SkinnedMesh
      if (s.isSkinnedMesh) {
        s.computeBoundingBox()
        s.computeBoundingSphere()
      }
    }
    state.boundsAngle = state.angle
  }
  return ray.intersectObjects(meshes, false)[0]?.object ?? null
}
