'use client'

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { slugify } from "@/lib/learn-slug"
import { accentColor, createTapTracker, kindColor, morphInfluence, selectionStyle, structureNameOf, type Highlight } from "@/lib/learn-viewer"
import type { Kind, Scene, Structure } from "@/lib/learn-types"
import { pickMesh } from "./pick"

export type ViewerProps = {
  scene: Scene
  structures: Record<string, Structure>
  selectedId: string | null
  onSelect: (id: string | null) => void
  angle: number
  onAngle: (angle: number) => void
  playing: boolean
  hiddenIds: Set<string> | null
  /** Muscles worked: what to light when nothing is selected (lib/muscles/groups.ts highlightOf). */
  highlight: Highlight | null
  onReady: () => void
  onError: (message: string) => void
}

type Part = { mesh: THREE.Mesh; id: string | null; kind: Kind | null; mat: THREE.MeshStandardMaterial; glow: number }

type Rig = {
  renderer: THREE.WebGLRenderer
  scene3: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  parts: Part[]
  byId: Map<string, Part[]>
  distal: THREE.Bone | null
  restQ: THREE.Quaternion
  axisLocal: THREE.Vector3 | null
  raf: number
  disposed: boolean
  angle: number
  /** The angle the skinned meshes' bounds were last computed at (see pick.ts); null = never. */
  boundsAngle: number | null
  dir: 1 | -1
  accent: THREE.Color
  invalidate?: () => void
}

declare global {
  interface Window {
    __wodLearn?: { ready: boolean; select: (id: string | null) => void; selected: () => string | null; parts: () => number; glow: (id: string) => number }
  }
}

const PLAY_STEP = 1.2 // degrees per frame

/**
 * Renders one Learn scene. Draws only when something changed (orbit, selection,
 * slider, resize, play), so an idle phone pays nothing. Everything three.js
 * lives in this file; SceneView loads it with next/dynamic, ssr: false.
 */
export default function AnatomyViewer(props: ViewerProps) {
  const host = useRef<HTMLDivElement>(null)
  const rigRef = useRef<Rig | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  // Build the scene once per file; tear it down completely on unmount or file change.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const probe = document.createElement("canvas").getContext("webgl2")
    if (!probe) { propsRef.current.onError("This phone or browser can't show 3D here."); return }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, Math.max(el.clientHeight, 1), false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.touchAction = "none"
    renderer.domElement.style.display = "block"
    el.appendChild(renderer.domElement)

    const scene3 = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / Math.max(el.clientHeight, 1), 0.01, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    scene3.add(new THREE.HemisphereLight("#ffffff", "#3a3f4b", 1.4))
    const key = new THREE.DirectionalLight("#ffffff", 1.6); key.position.set(2, 3, 2); scene3.add(key)
    const fill = new THREE.DirectionalLight("#9fb4ff", 0.6); fill.position.set(-3, 1, -2); scene3.add(fill)

    const rig: Rig = { renderer, scene3, camera, controls, parts: [], byId: new Map(), distal: null, restQ: new THREE.Quaternion(), axisLocal: null, raf: 0, disposed: false, angle: propsRef.current.angle, boundsAngle: null, dir: 1, accent: new THREE.Color(accentColor(el)) }
    rigRef.current = rig

    const frame = () => {
      rig.raf = 0
      if (rig.disposed) return
      if (propsRef.current.playing) {
        const max = propsRef.current.scene.movement?.range[1] ?? 0
        let a = rig.angle + rig.dir * PLAY_STEP
        if (a >= max) { a = max; rig.dir = -1 }
        if (a <= 0) { a = 0; rig.dir = 1 }
        rig.angle = a
        applyPose(rig, propsRef.current.scene, a)
        propsRef.current.onAngle(a)
      }
      renderer.render(scene3, camera)
      if (propsRef.current.playing) invalidate()
    }
    const invalidate = () => { if (!rig.raf && !rig.disposed) rig.raf = requestAnimationFrame(frame) }
    rig.invalidate = invalidate
    controls.addEventListener("change", invalidate)

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = Math.max(el.clientHeight, 1)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      invalidate()
    })
    ro.observe(el)

    const onLost = (e: Event) => { e.preventDefault(); propsRef.current.onError("The 3D view stopped. Reload the page to bring it back.") }
    renderer.domElement.addEventListener("webglcontextlost", onLost)

    // Tap to select: one main-button pointer that stayed within 6 px, never part of a pinch; empty space clears.
    const taps = createTapTracker()
    const onDown = (e: PointerEvent) => { taps.down(e.pointerId, e.clientX, e.clientY, e.button === 0) }
    const onMove = (e: PointerEvent) => { taps.move(e.pointerId, e.clientX, e.clientY) }
    const onCancel = (e: PointerEvent) => { taps.cancel(e.pointerId) }
    const onUp = (e: PointerEvent) => {
      if (!taps.up(e.pointerId, e.clientX, e.clientY)) return
      const r = renderer.domElement.getBoundingClientRect()
      const ptr = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ptr, camera)
      scene3.updateMatrixWorld()
      const hit = pickMesh(ray, rig.parts.filter((p) => p.mesh.visible && p.id).map((p) => p.mesh), rig)
      const part = hit ? rig.parts.find((p) => p.mesh === hit) : undefined
      propsRef.current.onSelect(part?.id ?? null)
    }
    renderer.domElement.addEventListener("pointerdown", onDown)
    renderer.domElement.addEventListener("pointermove", onMove)
    renderer.domElement.addEventListener("pointercancel", onCancel)
    renderer.domElement.addEventListener("pointerup", onUp)

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const { scene: sc, structures } = propsRef.current
    loader.load(
      sc.file.path,
      (gltf) => {
        if (rig.disposed) return
        const root = gltf.scene
        scene3.add(root)
        root.traverse((o) => {
          if ((o as THREE.Bone).isBone && o.name === "distal") rig.distal = o as THREE.Bone
          if ((o as THREE.Mesh).isMesh) {
            const mesh = o as THREE.Mesh
            const id = slugify(structureNameOf(mesh))
            const s = structures[id] ?? null
            const kind = s?.kind ?? null
            const mat = new THREE.MeshStandardMaterial({ color: kindColor(kind, s?.label ?? ""), roughness: kind === "bone" ? 0.72 : 0.55, metalness: 0, transparent: false, opacity: 1 })
            mesh.material = mat
            mesh.frustumCulled = false
            if (!s) mesh.visible = false // insertion areas and anything not in the scene's structure list
            const part: Part = { mesh, id: s ? id : null, kind, mat, glow: 0 }
            rig.parts.push(part)
            if (s) { const list = rig.byId.get(id) ?? []; list.push(part); rig.byId.set(id, list) }
          }
        })
        if (rig.distal && sc.movement) {
          rig.restQ.copy(rig.distal.quaternion)
          const wq = new THREE.Quaternion()
          rig.distal.getWorldQuaternion(wq)
          rig.axisLocal = new THREE.Vector3(...sc.movement.axis).normalize().applyQuaternion(wq.invert())
        }
        root.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const ctr = box.getCenter(new THREE.Vector3())
        const span = Math.max(size.x, size.y, size.z)
        controls.target.copy(ctr)
        controls.minDistance = span * 0.3
        controls.maxDistance = span * 4
        camera.position.copy(ctr).add(new THREE.Vector3(0, size.y * 0.1, span * 1.9))
        camera.near = span / 100
        camera.far = span * 20
        camera.updateProjectionMatrix()
        applyPose(rig, sc, rig.angle)
        applySelection(rig, propsRef.current.selectedId, propsRef.current.highlight)
        applyHidden(rig, propsRef.current.hiddenIds)
        window.__wodLearn = {
          ready: true,
          select: (id) => propsRef.current.onSelect(id),
          selected: () => propsRef.current.selectedId,
          parts: () => rig.parts.length,
          glow: (id) => Math.max(0, ...(rig.byId.get(id) ?? []).map((p) => p.glow)),
        }
        propsRef.current.onReady()
        invalidate()
      },
      undefined,
      () => { if (!rig.disposed) propsRef.current.onError("The 3D model couldn't load. The list below still works.") },
    )

    return () => {
      rig.disposed = true
      if (rig.raf) cancelAnimationFrame(rig.raf)
      ro.disconnect()
      controls.removeEventListener("change", invalidate)
      controls.dispose()
      renderer.domElement.removeEventListener("webglcontextlost", onLost)
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("pointercancel", onCancel)
      renderer.domElement.removeEventListener("pointerup", onUp)
      scene3.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose() }
      })
      renderer.dispose()
      renderer.domElement.remove()
      if (window.__wodLearn) window.__wodLearn.ready = false
      rigRef.current = null
    }
  }, [props.scene.file.path])

  // Prop-driven updates: each one touches the rig and asks for one frame.
  useEffect(() => { const r = rigRef.current; if (r) { applySelection(r, props.selectedId, props.highlight); r.invalidate?.() } }, [props.selectedId, props.highlight])
  useEffect(() => { const r = rigRef.current; if (r && !props.playing) { r.angle = props.angle; applyPose(r, props.scene, props.angle); r.invalidate?.() } }, [props.angle, props.playing, props.scene])
  useEffect(() => { const r = rigRef.current; if (r) { applyHidden(r, props.hiddenIds); r.invalidate?.() } }, [props.hiddenIds])
  useEffect(() => { const r = rigRef.current; if (r && props.playing) r.invalidate?.() }, [props.playing])

  return <div ref={host} className="h-full w-full" data-testid="anatomy-viewer" />
}

function applyPose(r: Rig, scene: Scene, angle: number) {
  if (!r.distal || !r.axisLocal || !scene.movement) return
  r.distal.quaternion.copy(r.restQ).multiply(new THREE.Quaternion().setFromAxisAngle(r.axisLocal, scene.movement.sign * THREE.MathUtils.degToRad(angle)))
  const c = morphInfluence(angle, scene.movement.range[1])
  for (const p of r.parts) if (p.mesh.morphTargetInfluences?.length) p.mesh.morphTargetInfluences[0] = c
}

/**
 * Selected: accent glow. With nothing selected, Muscles worked lights its primary groups fully and
 * secondary ones at half. Everything else that is not bone fades to 35% and stops writing depth.
 * Only faded parts are transparent: opaque parts keep the cheap pass.
 */
function applySelection(r: Rig, selectedId: string | null, highlight: Highlight | null) {
  for (const p of r.parts) {
    const st = selectionStyle(p.id, p.kind, selectedId, highlight)
    p.glow = st.glow
    p.mat.emissive.copy(r.accent).multiplyScalar(0.35 * st.glow)
    p.mat.opacity = st.opacity
    p.mat.transparent = st.transparent
    p.mat.depthWrite = st.depthWrite
    p.mat.needsUpdate = true
  }
}

function applyHidden(r: Rig, hidden: Set<string> | null) {
  for (const p of r.parts) if (p.id) p.mesh.visible = !(hidden && hidden.has(p.id))
}
