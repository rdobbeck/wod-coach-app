# Learn Anatomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Learn section on wod.coach: six joint scenes you can bend and five curated body-system scenes you can spin and tap, built from a pinned Z-Anatomy snapshot, served publicly at `/learn` and to clients at `/client/learn`.

**Architecture:** A build pipeline under `tools/anatomy/` (Blender scripts plus TypeScript) turns the Z-Anatomy Blender file into content-hashed GLBs in `public/anatomy/` and one merged `data/anatomy/learn.json`. Ryan's writing lives in `data/anatomy/authored/` and is merged in, never overwritten. One three.js viewer component renders both scene kinds; thin Next.js pages wrap it for the public site and the client shell. No database changes.

**Tech Stack:** Next.js 14 app router, React 18, Tailwind 3, three 0.185 (new dependency), Blender 5.2.2 LTS headless, glTF Transform CLI 4.5.0, Node test runner through `tsx --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-learn-anatomy-design.md`

## Global Constraints

- Z-Anatomy source: repo `Z-Anatomy/Models-of-human-anatomy`, commit `7b8d2e3333d2`, `Z-Anatomy.zip` sha256 `e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736`; `Startup.blend` inside is 306,838,281 bytes. Downloaded into `tools/anatomy/.work/`, never committed.
- Region method and configs: `maikleonhg/atlas` commit `7a21273d7bfe984541aa320de3c0438d42c5b7a2`, CC BY-SA 4.0; derived files keep a CC BY-SA header.
- Blender 5.2.2 LTS at `/Applications/Blender.app/Contents/MacOS/Blender` (override with `BLENDER=`), always headless (`-b`). glTF Transform CLI pinned `@gltf-transform/cli@4.5.0` via `npx -y`.
- `three` pinned `^0.185.0` with `@types/three@^0.185.0`; imported only under `components/learn/`.
- Node names inside every GLB are the Z-Anatomy object names, unchanged. The viewer reads `object.userData.name`, never `object.name`.
- Budgets, enforced by `verify.ts`: joint scene file ≤ 1,200,000 bytes; system scene file ≤ 3,000,000 bytes.
- All client-facing copy goes through `noLongDashes` from `lib/text.ts`: no em or en dashes anywhere.
- `anatomy:*` scripts never run inside `next build`; GLBs and `learn.json` are committed.
- Commit as `rdobbeck <ryandobbeck@gmail.com>` (repo-local git identity is already set); never push to `master`; work on branch `feat/learn-anatomy`.
- Every commit message ends with the two attribution lines this session uses (`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and the `Claude-Session:` line).

## Review Focus

1. A structure name with parentheses, slashes or quotes (Z-Anatomy has `Inferior vein of left ventricle (//Posterior '')` and `(Adductor minimus)`) must slug to a stable, URL-safe id and a clean label. Pinned in Task 2's tests.
2. A tap that is really the end of a drag (pointer moved more than 6 px) must not change the selection; a tap on empty space must clear it. Pinned in Task 11's `isTap` tests and Task 16's e2e.
3. A scene whose GLB fails to load (404, network drop) must show an error line and keep the structure list and card working, not spin forever. Pinned in Task 16's e2e with a routed 404.
4. An allowlist name that matches nothing in the source must fail the build by name, not silently ship a thinner scene. Pinned in Task 9's `verify` tests on `missing`.
5. The WebGL context being lost (phone backgrounds the tab) must surface the same error state as a failed load rather than a frozen black canvas. Pinned in Task 12's manual check and Task 16's e2e that dispatches `webglcontextlost`.

---

## File structure

Pipeline (new): `tools/anatomy/README.md`, `source.lock.json`, `fetch.sh`, `build.sh`, `compress.sh`, `list_names.py`, `build_region.py`, `build_system.py`, `extract_text.py`, `seed_roles.py`, `regions/configs.py` plus `regions/{hip,shoulder,lumbar,neck}.config.py`, `glb.ts`, `merge.ts`, `verify.ts`, `inspect.ts`, `glb.test.ts`, `merge.test.ts`, `verify.test.ts`, `fixtures/`. Working folder `tools/anatomy/.work/` (gitignored).

Content (new): `data/anatomy/authored/scenes.json`, `roles.json`, `coach-notes.json`, `systems/{muscles,skeleton,heart,breathing,nerves}.allowlist.json`; `data/anatomy/generated/structures.json`, `scenes.json`; `data/anatomy/learn.json`.

Assets (new): `public/anatomy/<id>.<hash8>.glb`, `public/anatomy/LICENSE.md`, `public/anatomy/posters/<id>.jpg`.

App (new): `lib/learn-types.ts`, `lib/learn-slug.ts`, `lib/learn.ts`, `lib/learn-viewer.ts`, `components/learn/AnatomyViewer.tsx`, `SceneView.tsx`, `StructureCard.tsx`, `StructureList.tsx`, `LayerChips.tsx`, `MovementSlider.tsx`, `SceneCards.tsx`, `LearnCredits.tsx`, `app/learn/layout.tsx`, `app/learn/page.tsx`, `app/learn/[scene]/page.tsx`, `app/learn/credits/page.tsx`, `app/client/learn/page.tsx`, `app/client/learn/[scene]/page.tsx`, `tests/learn.spec.ts`, `tests/unit/learn.test.ts`, `scripts/anatomy-posters.ts`.

App (modified): `package.json` (deps, scripts), `next.config.js` (cache header), `.gitignore`, `components/client/BottomNav.tsx` (fifth tab), `playwright.config.ts` (learn project).

Tasks 1 to 9 are the pipeline and content; they end with committed assets and `learn.json`. Tasks 10 to 18 are the app.

---

### Task 1: Pipeline scaffold and the pinned source download

**Files:**
- Create: `tools/anatomy/README.md`, `tools/anatomy/source.lock.json`, `tools/anatomy/fetch.sh`
- Modify: `.gitignore`, `package.json` (scripts)

**Interfaces:**
- Produces: `tools/anatomy/.work/source/Z-Anatomy/Startup.blend` on disk; `npm run anatomy:fetch`.

- [ ] **Step 1: Write the lock file**

`tools/anatomy/source.lock.json`:

```json
{
  "zanatomy": {
    "repo": "https://github.com/Z-Anatomy/Models-of-human-anatomy",
    "commit": "7b8d2e3333d2",
    "zip": "Z-Anatomy.zip",
    "sha256": "e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736",
    "blend": "Z-Anatomy/Startup.blend",
    "blendBytes": 306838281,
    "license": "CC-BY-SA-4.0"
  },
  "atlas": {
    "repo": "https://github.com/maikleonhg/atlas",
    "commit": "7a21273d7bfe984541aa320de3c0438d42c5b7a2",
    "license": "CC-BY-SA-4.0"
  },
  "tools": { "blender": "5.2.2", "gltfTransform": "4.5.0" }
}
```

- [ ] **Step 2: Write the fetch script**

`tools/anatomy/fetch.sh`:

```bash
#!/usr/bin/env bash
# Downloads the pinned Z-Anatomy snapshot into .work/source and verifies it.
# Also fetches the atlas commit (for seed_roles.py) into .work/atlas.
set -euo pipefail
cd "$(dirname "$0")"
commit=$(node -p "require('./source.lock.json').zanatomy.commit")
sha=$(node -p "require('./source.lock.json').zanatomy.sha256")
acommit=$(node -p "require('./source.lock.json').atlas.commit")
mkdir -p .work/source .work/atlas
zip=.work/source/Z-Anatomy.zip
if [ ! -f "$zip" ] || ! echo "$sha  $zip" | shasum -a 256 -c --status; then
  echo "» downloading Z-Anatomy.zip @ $commit (87 MB)"
  curl -sSL -o "$zip" "https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/$commit/Z-Anatomy.zip"
fi
echo "$sha  $zip" | shasum -a 256 -c --status || { echo "sha256 mismatch for $zip" >&2; exit 1; }
unzip -o -q "$zip" 'Z-Anatomy/Startup.blend' -d .work/source
if [ ! -f .work/atlas/pipeline/regions/configs.py ]; then
  echo "» downloading maikleonhg/atlas @ $acommit"
  curl -sSL -o .work/atlas.zip "https://github.com/maikleonhg/atlas/archive/$acommit.zip"
  rm -rf .work/atlas && mkdir -p .work/atlas
  unzip -q .work/atlas.zip -d .work/atlas-tmp && mv .work/atlas-tmp/atlas-*/* .work/atlas/ && rm -rf .work/atlas-tmp .work/atlas.zip
fi
ls -la .work/source/Z-Anatomy/Startup.blend
```

Run `chmod +x tools/anatomy/fetch.sh`.

- [ ] **Step 3: Ignore the working folder and add the script**

Append to `.gitignore`:

```
# anatomy pipeline working files (downloaded source, intermediate exports)
tools/anatomy/.work/
```

In `package.json` `scripts`, add:

```json
"anatomy:fetch": "bash tools/anatomy/fetch.sh"
```

- [ ] **Step 4: Write the README**

`tools/anatomy/README.md`:

```markdown
# Anatomy pipeline

Turns the pinned Z-Anatomy snapshot into the GLB scenes and `data/anatomy/learn.json`
that the Learn pages read. Spec: `docs/superpowers/specs/2026-10-14-learn-anatomy-design.md`.

Requirements: macOS, Blender 5.2.2 LTS at `/Applications/Blender.app` (`brew install --cask blender`;
override with `BLENDER=/path/to/Blender`), Node, network for the first fetch.

    npm run anatomy:fetch    # pinned source into tools/anatomy/.work (never committed)
    npm run anatomy:build    # regions, systems, definitions, compress, merge, verify
    npm run anatomy:verify   # budgets and references only

Steps and outputs:

| Step | Script | Output |
|---|---|---|
| fetch | `fetch.sh` | `.work/source/Z-Anatomy/Startup.blend`, `.work/atlas/` |
| regions | `build_region.py <id>` | `.work/regions/<id>.glb`, `<id>.meta.json`, `<id>.index.json` |
| systems | `build_system.py <id>` | `.work/systems/<id>.glb`, `<id>.index.json` |
| definitions | `extract_text.py` | `.work/definitions.json` |
| compress | `compress.sh` | `public/anatomy/<id>.<hash8>.glb`, `.work/files.json` |
| merge | `merge.ts` | `data/anatomy/generated/*.json`, `data/anatomy/learn.json` |
| verify | `verify.ts` | exit 1 on any budget or reference failure |

Authored content lives in `data/anatomy/authored/` and is never written by the pipeline
(except `seed_roles.py`, which only writes `roles.json` when it does not exist yet).

Licences: geometry and definitions are CC BY-SA 4.0 (Z-Anatomy, from BodyParts3D CC BY 4.0;
Wikipedia text). `build_region.py` and `regions/*.py` derive from maikleonhg/atlas, CC BY-SA 4.0.
See `public/anatomy/LICENSE.md`.

Upgrading Blender or the snapshot: change `source.lock.json`, rebuild, and compare the
triangle counts `verify` prints before committing the new assets.
```

- [ ] **Step 5: Run the fetch and check the file**

Run: `npm run anatomy:fetch`
Expected: the last line lists `Startup.blend` with size `306838281`, and `tools/anatomy/.work/atlas/pipeline/regions/configs.py` exists. A second run prints no download line (cached, verified).

- [ ] **Step 6: Commit**

```bash
git add tools/anatomy/README.md tools/anatomy/source.lock.json tools/anatomy/fetch.sh .gitignore package.json
git commit -m "anatomy: pipeline scaffold, pinned Z-Anatomy source fetch"
```

---

### Task 2: Shared GLB reader and name helpers, with tests

**Files:**
- Create: `lib/learn-slug.ts`, `tools/anatomy/glb.ts`, `tools/anatomy/glb.test.ts`, `tools/anatomy/fixtures/two-nodes.glb` (generated in a step), `tests/unit/learn-slug.test.ts`
- Modify: `package.json` (script `test:unit`)

**Interfaces:**
- Produces: `slugify(name: string): string`, `baseName(name: string): string`, `sideOf(name: string): "r" | "l" | "m"`, `labelFrom(base: string): string` from `lib/learn-slug.ts` (used by the pipeline and the viewer). `readGlbJson(path: string): GlbJson`, `nodeNames(j: GlbJson): string[]`, `meshNodeNames(j: GlbJson): string[]`, `triangleCount(j: GlbJson): number` from `tools/anatomy/glb.ts`.

- [ ] **Step 1: Write the failing slug tests**

`tests/unit/learn-slug.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { baseName, labelFrom, sideOf, slugify } from "../../lib/learn-slug"

test("side suffix is stripped from the id and reported separately", () => {
  assert.equal(slugify("Rectus femoris muscle.r"), "rectus-femoris-muscle")
  assert.equal(slugify("Rectus femoris muscle.l"), "rectus-femoris-muscle")
  assert.equal(sideOf("Rectus femoris muscle.r"), "r")
  assert.equal(sideOf("Rectus femoris muscle.l"), "l")
  assert.equal(sideOf("Diaphragm"), "m")
  assert.equal(baseName("Foot bones.r"), "Foot bones")
})

test("awkward source names give safe ids", () => {
  assert.equal(slugify("Inferior vein of left ventricle (//Posterior '')"), "inferior-vein-of-left-ventricle-posterior")
  assert.equal(slugify("(Adductor minimus)"), "adductor-minimus")
  assert.equal(slugify("Vagus nerve (X)"), "vagus-nerve-x")
  assert.equal(slugify("Apicoposterior segmental bronchus of left lung (BI+BII)"), "apicoposterior-segmental-bronchus-of-left-lung-bi-bii")
})

test("labels drop the word muscle and wrapping parentheses", () => {
  assert.equal(labelFrom("Rectus femoris muscle"), "Rectus femoris")
  assert.equal(labelFrom("External intercostal muscles"), "External intercostal")
  assert.equal(labelFrom("(Adductor minimus)"), "Adductor minimus")
  assert.equal(labelFrom("Femur"), "Femur")
  assert.equal(labelFrom("long head of biceps femoris"), "Long head of biceps femoris")
})
```

- [ ] **Step 2: Add the unit test script and run it to see it fail**

In `package.json` `scripts`, add:

```json
"test:unit": "tsx --test 'tools/anatomy/*.test.ts' 'tests/unit/*.test.ts'"
```

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/learn-slug`.

- [ ] **Step 3: Write the slug helpers**

`lib/learn-slug.ts`:

```ts
/**
 * Structure identity for Learn. Z-Anatomy names its objects like
 * "Rectus femoris muscle.r"; the trailing .r/.l is the side. The id is the
 * name without the side, slugified, so left and right share one structure.
 * Used by the build pipeline and by the viewer, so it must stay dependency free.
 */
const SIDE_RE = /\.(r|l)$/

export const baseName = (name: string) => name.replace(SIDE_RE, "")

export const sideOf = (name: string): "r" | "l" | "m" => (name.endsWith(".r") ? "r" : name.endsWith(".l") ? "l" : "m")

export function slugify(name: string) {
  return baseName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** "Rectus femoris muscle" -> "Rectus femoris"; "(Adductor minimus)" -> "Adductor minimus". */
export function labelFrom(base: string) {
  const s = base
    .replace(/^\((.*)\)$/, "$1")
    .replace(/\s+muscles?$/i, "")
    .trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
```

- [ ] **Step 4: Run the slug tests**

Run: `npm run test:unit`
Expected: the three slug tests PASS.

- [ ] **Step 5: Write the failing GLB reader test**

`tools/anatomy/glb.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { meshNodeNames, nodeNames, readGlbJson, triangleCount } from "./glb"

/** Builds a tiny valid GLB (JSON chunk only) so the reader can be tested without Blender. */
function writeFixture(path: string) {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    nodes: [{ name: "Rig" }, { name: "Femur.r", mesh: 0 }, { name: "Rectus femoris muscle.r", mesh: 1 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] },
      { primitives: [{ attributes: { POSITION: 0 }, indices: 2 }] },
    ],
    accessors: [{ count: 3 }, { count: 9 }, { count: 300 }],
  })
  const jsonBuf = Buffer.from(json.padEnd(json.length + ((4 - (json.length % 4)) % 4), " "), "utf8")
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0) // 'glTF'
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length, 8)
  const chunk = Buffer.alloc(8)
  chunk.writeUInt32LE(jsonBuf.length, 0)
  chunk.writeUInt32LE(0x4e4f534a, 4) // 'JSON'
  writeFileSync(path, Buffer.concat([header, chunk, jsonBuf]))
}

test("reads names and counts triangles from the JSON chunk", () => {
  mkdirSync(join(__dirname, "fixtures"), { recursive: true })
  const p = join(__dirname, "fixtures", "two-nodes.glb")
  writeFixture(p)
  const j = readGlbJson(p)
  assert.deepEqual(nodeNames(j), ["Rig", "Femur.r", "Rectus femoris muscle.r"])
  assert.deepEqual(meshNodeNames(j), ["Femur.r", "Rectus femoris muscle.r"])
  assert.equal(triangleCount(j), 3 + 100)
})

test("rejects a file that is not a GLB", () => {
  const p = join(__dirname, "fixtures", "not.glb")
  writeFileSync(p, "hello")
  assert.throws(() => readGlbJson(p), /not a GLB/)
})
```

- [ ] **Step 6: Run it to see it fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `./glb`.

- [ ] **Step 7: Write the GLB reader**

`tools/anatomy/glb.ts`:

```ts
import { readFileSync } from "node:fs"

/** The parts of the glTF JSON chunk the pipeline reads. */
export type GlbJson = {
  nodes?: { name?: string; mesh?: number; skin?: number }[]
  meshes?: { name?: string; primitives: { indices?: number; attributes: Record<string, number>; targets?: unknown[] }[] }[]
  accessors?: { count: number }[]
  skins?: unknown[]
}

const MAGIC = 0x46546c67 // 'glTF'
const JSON_CHUNK = 0x4e4f534a // 'JSON'

/** Parses only the JSON chunk of a .glb; the binary payload is never read into memory twice. */
export function readGlbJson(path: string): GlbJson {
  const buf = readFileSync(path)
  if (buf.length < 20 || buf.readUInt32LE(0) !== MAGIC) throw new Error(`${path}: not a GLB`)
  const len = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== JSON_CHUNK) throw new Error(`${path}: first chunk is not JSON`)
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8")) as GlbJson
}

export const nodeNames = (j: GlbJson) => (j.nodes ?? []).map((n) => n.name ?? "").filter(Boolean)

export const meshNodeNames = (j: GlbJson) =>
  (j.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? "").filter(Boolean)

export function triangleCount(j: GlbJson) {
  let t = 0
  for (const m of j.meshes ?? [])
    for (const p of m.primitives) if (p.indices !== undefined) t += Math.floor((j.accessors?.[p.indices]?.count ?? 0) / 3)
  return t
}
```

- [ ] **Step 8: Run the tests**

Run: `npm run test:unit`
Expected: all five tests PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/learn-slug.ts tools/anatomy/glb.ts tools/anatomy/glb.test.ts tests/unit/learn-slug.test.ts package.json
git commit -m "anatomy: slug helpers and GLB JSON reader with tests"
```

Note: `tools/anatomy/fixtures/` is written by the test; add `tools/anatomy/fixtures/*.glb` to `.gitignore` in this commit so generated fixtures stay out of git.

---

### Task 3: Joint scenes from the atlas region builder

**Files:**
- Create: `tools/anatomy/regions/configs.py`, `tools/anatomy/regions/hip.config.py`, `shoulder.config.py`, `lumbar.config.py`, `neck.config.py` (copied from the atlas and renamed), `tools/anatomy/build_region.py`, `tools/anatomy/inspect.ts`

**Interfaces:**
- Consumes: `tools/anatomy/.work/source/Z-Anatomy/Startup.blend` (Task 1), `tools/anatomy/glb.ts` (Task 2).
- Produces: `.work/regions/<id>.glb` (raw, uncompressed), `.work/regions/<id>.meta.json` `{ id, pivot: [x,y,z], axis: [x,y,z], up: [x,y,z], sign: 1|-1, inserciones: {...} }`, `.work/regions/<id>.index.json` `{ id, bones: string[], muscles: string[], attach: string[] }`. Scene ids: `knee`, `hip`, `shoulder`, `elbow`, `lumbar`, `neck`.

- [ ] **Step 1: Copy the region configs from the pinned atlas and rename them to our ids**

```bash
cd tools/anatomy
mkdir -p regions
cp .work/atlas/pipeline/regions/configs.py regions/configs.py
cp .work/atlas/pipeline/regions/cadera.config.py regions/hip.config.py
cp .work/atlas/pipeline/regions/hombro.config.py regions/shoulder.config.py
cp .work/atlas/pipeline/regions/lumbar.config.py regions/lumbar.config.py
cp .work/atlas/pipeline/regions/cuello.config.py regions/neck.config.py
```

Open `regions/configs.py`. It defines `REGIONS = { 'codo': {...}, 'rodilla': {...} }` inline and then loads every `regions/<id>.config.py` (each defines `REGION`) under the file's id. Make these edits:
1. Rename the inline key `'codo'` to `'elbow'` and `'rodilla'` to `'knee'`.
2. Add this header as the first lines of `configs.py` and each `*.config.py`:

```python
# Region definitions derived from maikleonhg/atlas (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2),
# licensed CC BY-SA 4.0. This file stays CC BY-SA 4.0. Keys are Spanish; see tools/anatomy/README.md.
```

Check the loader picked up the renamed files:

Run: `cd tools/anatomy && python3 -c "import sys; sys.path.insert(0,'regions'); from configs import REGIONS; print(sorted(REGIONS))"`
Expected: `['elbow', 'hip', 'knee', 'lumbar', 'neck', 'shoulder']`. If the loader lists ids explicitly instead of globbing, edit that list to the six ids above.

- [ ] **Step 2: Write the region builder**

`tools/anatomy/build_region.py` is the atlas `build_region.py` with four changes: paths under `.work/`, the id from argv, an index file, and the header. Copy it from `.work/atlas/pipeline/build_region.py`, then apply these edits so the top of the file reads:

```python
# Joint-scene builder, derived from maikleonhg/atlas build_region.py
# (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2), CC BY-SA 4.0. This file stays CC BY-SA 4.0.
# Usage (from tools/anatomy): $BLENDER -b --python build_region.py -- <scene id>
# Reads  .work/source/Z-Anatomy/Startup.blend and regions/configs.py
# Writes .work/regions/<id>.glb, <id>.meta.json, <id>.index.json
import bpy, bmesh, json, math, re, sys, os
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, 'regions'); from configs import REGIONS
RID = sys.argv[-1]; R = REGIONS[RID]
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, '.work/source/Z-Anatomy/Startup.blend'))
```

Replace the original `bpy.ops.wm.open_mainfile(filepath='za/zx/Z-Anatomy/Startup.blend')` line with the one above and delete the original `RID=sys.argv[-1]; R=REGIONS[RID]` and `sys.path.insert(0,'regions'); from configs import REGIONS` lines so each appears once.

At the end of the file, replace the export block (`import os; os.makedirs('out',exist_ok=True)` through the final `print('verts',...)`) with:

```python
os.makedirs('.work/regions', exist_ok=True)
bpy.ops.export_scene.gltf(filepath=f'.work/regions/{RID}.glb', export_format='GLB', use_active_scene=True, export_skins=True,
    export_morph=True, export_animations=False, export_materials='NONE', export_yup=True, export_texcoords=False)
conv = lambda v: [v.x, v.z, -v.y]   # Blender Z-up -> glTF Y-up
json.dump({'id': RID, 'pivot': conv(P), 'axis': conv(axis), 'up': conv(up), 'sign': sign, 'inserciones': att},
          open(f'.work/regions/{RID}.meta.json', 'w'), ensure_ascii=False)
g = R['movil']['grupo']
bones = list(R['fijo']['huesos']) + list(R['movil']['huesos']) + [g['name']] + list(R['parcial']) + list(R['fijo'].get('grupos', {}))
muscles = list(R['fijo']['musculos']) + list(R['cruzan'])
attach = sorted({a for oe in R['inserciones'].values() for k in ('o', 'e') for a in oe[k]})
json.dump({'id': RID, 'bones': bones, 'muscles': muscles, 'attach': attach}, open(f'.work/regions/{RID}.index.json', 'w'), ensure_ascii=False, indent=1)
print('verts', sum(len(o.data.vertices) for o in keep if o.type == 'MESH'), 'done')
```

Everything between (the joint maths, `make()`, the weights, the shape key) stays exactly as in the atlas file.

- [ ] **Step 3: Write the inspect helper**

`tools/anatomy/inspect.ts`:

```ts
import { meshNodeNames, nodeNames, readGlbJson, triangleCount } from "./glb"
import { statSync } from "node:fs"

/** Usage: npx tsx tools/anatomy/inspect.ts <file.glb> [--names] */
const [, , file, flag] = process.argv
if (!file) throw new Error("usage: inspect.ts <file.glb> [--names]")
const j = readGlbJson(file)
const names = nodeNames(j)
const meshes = meshNodeNames(j)
const morphs = (j.meshes ?? []).filter((m) => m.primitives.some((p) => p.targets?.length)).length
console.log(JSON.stringify({ bytes: statSync(file).size, nodes: names.length, meshes: meshes.length, skins: j.skins?.length ?? 0, morphMeshes: morphs, triangles: triangleCount(j), hasDistal: names.includes("distal") }))
if (flag === "--names") console.log(meshes.join("\n"))
```

- [ ] **Step 4: Build the knee and inspect it**

Run (from the repo root):

```bash
cd tools/anatomy && "${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" -b --python build_region.py -- knee > .work/knee.log 2>&1; tail -3 .work/knee.log; cd ../..
npx tsx tools/anatomy/inspect.ts tools/anatomy/.work/regions/knee.glb
```

Expected: the log ends with `verts 57047 done`; inspect prints `meshes: 50`, `skins: 50` or `51` (the raw export carries one unused skin that compression prunes), `morphMeshes: 6`, `hasDistal: true`, `triangles: 113076`. `.work/regions/knee.meta.json` has `sign: -1` and `.work/regions/knee.index.json` lists 6 bones (`Hip bone.r`, `Femur.r`, `Tibia.r`, `Fibula.r`, `Foot bones.r`, `Patella.r`).

- [ ] **Step 5: Build the other five**

```bash
cd tools/anatomy
for id in hip shoulder elbow lumbar neck; do
  "${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" -b --python build_region.py -- $id > .work/$id.log 2>&1 || { tail -20 .work/$id.log; exit 1; }
  grep -E 'done$' .work/$id.log
done
cd ../..
for id in hip shoulder elbow lumbar neck; do npx tsx tools/anatomy/inspect.ts tools/anatomy/.work/regions/$id.glb; done
```

Expected: every log ends in `done`; every inspect line has `hasDistal: true` and `skins` within one of `meshes`. Lines printed by the script that start with `falta` name insertion objects missing in the source; they are informational.

- [ ] **Step 6: Commit**

```bash
git add tools/anatomy/regions tools/anatomy/build_region.py tools/anatomy/inspect.ts
git commit -m "anatomy: joint scene builder from the atlas region method (CC BY-SA)"
```

---

### Task 4: System scenes from curated allowlists

**Files:**
- Create: `tools/anatomy/list_names.py`, `tools/anatomy/build_system.py`, `data/anatomy/authored/systems/muscles.allowlist.json`, `skeleton.allowlist.json`, `heart.allowlist.json`, `breathing.allowlist.json`, `nerves.allowlist.json`

**Interfaces:**
- Consumes: the source file from Task 1; `inspect.ts` from Task 3.
- Produces: `.work/systems/<id>.glb` and `.work/systems/<id>.index.json` `{ id, objects: { name: string; kind: "bone"|"muscle"|"vessel"|"nerve"|"organ"|"other" }[], missing: string[] }`. Allowlist shape (read by `build_system.py` and `compress.sh`):

```json
{
  "id": "heart",
  "collections": ["5: Cardiovascular system"],
  "include": ["Left ventricle", { "name": "Right atrium", "kind": "organ" }],
  "exclude": [],
  "ratio": 0.25,
  "curveResolution": 4,
  "bevelResolution": 2,
  "simplify": null
}
```

`include` is either the string `"*"` (every mesh and curve in the collections) or a list of base names (no `.r`/`.l`), each optionally an object with a `kind` override. `simplify` is `null` or `{ "ratio": 0.5, "error": 0.001 }` for `compress.sh`.

- [ ] **Step 1: Write the name lister (curation tool)**

`tools/anatomy/list_names.py`:

```python
# Lists Z-Anatomy object base names in a top-level collection, optionally filtered by a regex.
# Usage: $BLENDER -b --python list_names.py -- "<collection substring>" ["<regex>"]
import bpy, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:]
sub = args[0]; pat = re.compile(args[1], re.I) if len(args) > 1 else None
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, '.work/source/Z-Anatomy/Startup.blend'))
S = bpy.context.scene
def all_objs(c):
    out = list(c.objects)
    for ch in c.children: out += all_objs(ch)
    return out
seen = set()
for coll in S.collection.children:
    if sub.lower() not in coll.name.lower(): continue
    for o in all_objs(coll):
        if o.type not in ('MESH', 'CURVE') or o.name.endswith(('.j', '.t', '.g')): continue
        b = re.sub(r'\.(r|l)$', '', o.name)
        if b in seen or (pat and not pat.search(b)): continue
        seen.add(b)
        size = len(o.data.polygons) if o.type == 'MESH' else 'curve'
        print(f'{b}\t{o.type}\t{size}')
print(f'# {len(seen)} names')
```

- [ ] **Step 2: Write the five allowlists**

`data/anatomy/authored/systems/muscles.allowlist.json` (measured: 644 meshes, 572k triangles, 2.06 MB):

```json
{ "id": "muscles", "collections": ["4: Muscular system"], "include": "*", "exclude": [], "ratio": 0.25, "curveResolution": 4, "bevelResolution": 2, "simplify": null }
```

`data/anatomy/authored/systems/skeleton.allowlist.json` (measured 6.6 MB at ratio 0.25; start lower and let `verify` steer):

```json
{ "id": "skeleton", "collections": ["1: Skeletal system"], "include": "*", "exclude": [], "ratio": 0.1, "curveResolution": 4, "bevelResolution": 2, "simplify": { "ratio": 0.5, "error": 0.001 } }
```

`data/anatomy/authored/systems/heart.allowlist.json`:

```json
{
  "id": "heart",
  "collections": ["5: Cardiovascular system"],
  "include": [
    { "name": "Right atrium", "kind": "organ" }, { "name": "Right ventricle", "kind": "organ" },
    { "name": "Left atrium", "kind": "organ" }, { "name": "Left ventricle", "kind": "organ" },
    { "name": "Pulmonary trunk", "kind": "vessel" },
    "Right coronary artery", "Left coronary artery", "Circumflex artery of heart", "Coronary sinus",
    "Ascending aorta", "Thoracic aorta", "Abdominal aorta",
    "Left pulmonary artery", "Right superior pulmonary vein",
    "Superior vena cava", "Right brachiocephalic vein", "Left brachiocephalic vein",
    "Right common carotid artery", "Left common carotid artery", "Internal carotid artery", "External carotid artery",
    "Internal jugular vein", "External jugular vein",
    "Right subclavian artery", "Left subclavian artery", "Axillary artery", "Brachial artery", "Radial artery", "Ulnar artery",
    "Common iliac artery", "External iliac artery", "Internal iliac artery",
    "Femoral artery", "Deep femoral artery", "Popliteal artery", "Anterior tibial artery", "Posterior tibial artery"
  ],
  "exclude": [],
  "ratio": 0.25, "curveResolution": 4, "bevelResolution": 2, "simplify": null
}
```

`data/anatomy/authored/systems/breathing.allowlist.json`:

```json
{
  "id": "breathing",
  "collections": ["8: Visceral systems", "4: Muscular system"],
  "include": [
    "Trachea", "Right main bronchus", "Left main bronchus", "Intermediate bronchus",
    "Right superior lobar bronchus", "Middle lobar bronchus", "Right inferior lobar bronchus",
    "Left superior lobar bronchus", "Left inferior lobar bronchus",
    "Superior lobe of right lung", "Middle lobe of right lung", "Inferior lobe of right lung",
    "Superior lobe of left lung", "Inferior lobe of left lung",
    "Diaphragm", "External intercostal muscles", "Internal intercostal muscles", "Innermost intercostal muscles",
    "Scalenus anterior muscle", "Scalenus medius muscle", "Scalenus posterior muscle", "Sternocleidomastoid muscle",
    "Serratus posterior superior muscle", "Serratus posterior inferior muscle", "Transversus thoracis muscle"
  ],
  "exclude": [],
  "ratio": 0.25, "curveResolution": 4, "bevelResolution": 2, "simplify": null
}
```

`data/anatomy/authored/systems/nerves.allowlist.json` (the brainstem parts and limb nerves below are verified names; the cerebrum, cerebellum, spinal cord and lower-limb nerves must be added by name in Step 4):

```json
{
  "id": "nerves",
  "collections": ["7: Nervous system & Sense organs"],
  "include": [
    { "name": "Midbrain", "kind": "organ" }, { "name": "Pons", "kind": "organ" }, { "name": "Medulla oblongata", "kind": "organ" },
    { "name": "Thalamus", "kind": "organ" }, { "name": "Hypothalamus", "kind": "organ" },
    "Roots of brachial plexus", "Superior trunk of brachial plexus", "Middle trunk of brachial plexus", "Inferior trunk of brachial plexus",
    "Posterior cord of brachial plexus", "Axillary nerve", "Musculocutaneous nerve", "Radial nerve", "Median nerve", "Ulnar nerve",
    "Femoral nerve", "Obturator nerve", "Sciatic nerve", "Superficial fibular nerve", "Deep fibular nerve", "Vagus nerve (X)"
  ],
  "exclude": [],
  "ratio": 0.2, "curveResolution": 4, "bevelResolution": 2, "simplify": null
}
```

- [ ] **Step 3: Write the system builder**

`tools/anatomy/build_system.py`:

```python
# Exports one curated system scene from Z-Anatomy.
# Usage (from anywhere): $BLENDER -b --python build_system.py -- <scene id>
# Reads  data/anatomy/authored/systems/<id>.allowlist.json and .work/source/Z-Anatomy/Startup.blend
# Writes .work/systems/<id>.glb and .work/systems/<id>.index.json
import bpy, sys, json, re, os
RID = sys.argv[-1]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
A = json.load(open(os.path.join(ROOT, 'data', 'anatomy', 'authored', 'systems', f'{RID}.allowlist.json')))
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, '.work', 'source', 'Z-Anatomy', 'Startup.blend'))
S = bpy.context.scene
def all_objs(c):
    out = list(c.objects)
    for ch in c.children: out += all_objs(ch)
    return out
SIDE = re.compile(r'\.(r|l)$')
base = lambda n: SIDE.sub('', n)
entries = A['include']
wanted = None if entries == '*' else {(e['name'] if isinstance(e, dict) else e) for e in entries}
kinds = {e['name']: e['kind'] for e in entries if isinstance(e, dict) and 'kind' in e} if wanted is not None else {}
exclude = set(A.get('exclude', []))
KIND = {'1: Skeletal system': 'bone', '4: Muscular system': 'muscle', '5: Cardiovascular system': 'vessel',
        '7: Nervous system & Sense organs': 'nerve', '8: Visceral systems': 'organ'}
chosen = {}  # object name -> (object, collection name)
for cname in A['collections']:
    coll = S.collection.children.get(cname)
    if coll is None: raise SystemExit(f'collection not found: {cname}')
    for o in all_objs(coll):
        if o.type not in ('MESH', 'CURVE') or o.name.endswith(('.j', '.t', '.g')): continue
        b = base(o.name)
        if b in exclude or (wanted is not None and b not in wanted): continue
        if o.type == 'MESH' and len(o.data.vertices) <= 10: continue
        chosen.setdefault(o.name, (o, cname))
missing = sorted(wanted - {base(n) for n in chosen}) if wanted is not None else []
objs = [o for o, _ in chosen.values()]
if not objs: raise SystemExit(f'{RID}: nothing to export')
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.hide_set(False); o.hide_viewport = False; o.select_set(True)
    for m in o.modifiers:
        if m.type == 'SUBSURF': m.levels = 0
    if o.type == 'CURVE':
        o.data.resolution_u = A.get('curveResolution', 4)
        o.data.bevel_resolution = A.get('bevelResolution', 2)
    elif len(o.data.polygons) > 400:
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = A.get('ratio', 0.25)
bpy.context.view_layer.objects.active = objs[0]
os.makedirs(os.path.join(HERE, '.work', 'systems'), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, '.work', 'systems', f'{RID}.glb'), export_format='GLB',
    use_selection=True, export_apply=True, export_materials='NONE', export_yup=True, export_texcoords=False,
    export_animations=False, export_skins=False, export_morph=False)
index = {'id': RID,
         'objects': [{'name': n, 'kind': kinds.get(base(n)) or KIND.get(c, 'other')} for n, (o, c) in sorted(chosen.items())],
         'missing': missing}
json.dump(index, open(os.path.join(HERE, '.work', 'systems', f'{RID}.index.json'), 'w'), ensure_ascii=False, indent=1)
print('exported', len(objs), 'objects; missing', len(missing), 'done')
```

- [ ] **Step 4: Complete the nerves allowlist by name**

Run:

```bash
cd tools/anatomy
"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" -b --python list_names.py -- "Nervous" "hemisphere|cerebel|cerebr|spinal cord|tibial nerve|common fibular|lumbar plexus|sacral plexus|lumbosacral" 2>/dev/null | grep -v "^Blender\|^scripts disabled"
cd ../..
```

Add to `nerves.allowlist.json` `include`, with `"kind": "organ"` for brain parts: the cerebral hemisphere objects (left and right, or one bilateral name), the cerebellum, the spinal cord, plus `Tibial nerve` and `Common fibular nerve` and the lumbar and sacral plexus names exactly as printed. If a name you expected does not print, leave it out; `missing` will catch typos.

- [ ] **Step 5: Build all five systems and check**

```bash
cd tools/anatomy
for id in muscles skeleton heart breathing nerves; do
  "${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" -b --python build_system.py -- $id > .work/sys-$id.log 2>&1 || { tail -20 .work/sys-$id.log; exit 1; }
  grep -E 'done$' .work/sys-$id.log
  node -e "const i=require('./.work/systems/$id.index.json'); if(i.missing.length){console.error('$id missing:',i.missing); process.exit(1)}"
done
cd ../..
for id in muscles skeleton heart breathing nerves; do echo -n "$id "; npx tsx tools/anatomy/inspect.ts tools/anatomy/.work/systems/$id.glb; done
```

Expected: each log ends `... missing 0 done`; `muscles` inspects at between 640 and 690 meshes (empty meshes are pruned later by compression) and about 572k triangles; `heart` and `breathing` and `nerves` have far fewer triangles than the uncurated probes (under 1.5M before compression). Raw sizes are not the budget; `compress.sh` (Task 6) is.

- [ ] **Step 6: Commit**

```bash
git add tools/anatomy/list_names.py tools/anatomy/build_system.py data/anatomy/authored/systems
git commit -m "anatomy: curated system scene builder and the five v1 allowlists"
```

---

### Task 5: Definitions from the Z-Anatomy text blocks

**Files:**
- Create: `tools/anatomy/extract_text.py`

**Interfaces:**
- Produces: `.work/definitions.json` `{ [structureBaseName: string]: string }`, the first one or two paragraphs after the heading, wiki section markers removed.

- [ ] **Step 1: Write the extractor**

`tools/anatomy/extract_text.py`:

```python
# Pulls the definition text blocks Z-Anatomy ships (Wikipedia-derived, CC BY-SA) into one JSON file.
# Usage: $BLENDER -b --python extract_text.py
# Writes .work/definitions.json keyed by structure base name (the text block name).
import bpy, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, '.work', 'source', 'Z-Anatomy', 'Startup.blend'))
out = {}
for t in bpy.data.texts:
    lines = [l.rstrip() for l in t.as_string().split('\n')]
    i = 0
    # Skip leading blanks and the ALL-CAPS heading line(s).
    while i < len(lines) and (not lines[i].strip() or lines[i].strip() == lines[i].strip().upper()):
        i += 1
    paras, cur = [], []
    for l in lines[i:]:
        if l.startswith('=='):   # first wiki section ("== Structure ==") ends the lead
            break
        if not l.strip():
            if cur: paras.append(' '.join(cur)); cur = []
            continue
        cur.append(l.strip())
    if cur: paras.append(' '.join(cur))
    text = ' '.join(paras[:2]).strip()
    if text: out[t.name] = text
json.dump(out, open(os.path.join(HERE, '.work', 'definitions.json'), 'w'), ensure_ascii=False, indent=0)
print('definitions', len(out), 'done')
```

- [ ] **Step 2: Run it and spot-check**

```bash
cd tools/anatomy && "${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" -b --python extract_text.py 2>/dev/null | grep definitions; cd ../..
node -e "const d=require('./tools/anatomy/.work/definitions.json'); console.log(Object.keys(d).length); for (const k of ['Rectus femoris muscle','Diaphragm','Femur','Sciatic nerve']) console.log(k,'→',(d[k]||'MISSING').slice(0,90))"
```

Expected: `definitions 3839 done` (±50); the four samples print and start with "The quadriceps femoris muscle", "The thoracic diaphragm", "The femur", "The sciatic nerve".

- [ ] **Step 3: Commit**

```bash
git add tools/anatomy/extract_text.py
git commit -m "anatomy: extract Z-Anatomy definitions"
```

---

### Task 6: Compression, hashed assets, cache header, licence file

**Files:**
- Create: `tools/anatomy/compress.sh`, `public/anatomy/LICENSE.md`
- Modify: `next.config.js`

**Interfaces:**
- Consumes: `.work/regions/*.glb`, `.work/systems/*.glb`, the allowlists' `simplify` field.
- Produces: `public/anatomy/<id>.<hash8>.glb` and `.work/files.json` `{ [id]: { kind: "region"|"system", path: "/anatomy/<id>.<hash8>.glb", bytes: number, sha256: string } }`.

- [ ] **Step 1: Write the compressor**

`tools/anatomy/compress.sh`:

```bash
#!/usr/bin/env bash
# .work/{regions,systems}/<id>.glb -> public/anatomy/<id>.<hash8>.glb, plus .work/files.json.
# Systems whose allowlist has "simplify" go through gltf-transform simplify first. Everything is meshopt compressed.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=../..
OUT=$ROOT/public/anatomy
GT="npx -y @gltf-transform/cli@4.5.0"
mkdir -p "$OUT" .work/compressed
echo "{}" > .work/files.json
for src in .work/regions/*.glb .work/systems/*.glb; do
  [ -f "$src" ] || continue
  id=$(basename "$src" .glb)
  dir=$(basename "$(dirname "$src")")      # regions | systems
  kind=${dir%s}                             # region  | system
  tmp=.work/compressed/$id.glb
  simp=""
  if [ "$kind" = system ]; then
    simp=$(node -p "const a=require('$ROOT/data/anatomy/authored/systems/$id.allowlist.json'); a.simplify ? a.simplify.ratio+' '+a.simplify.error : ''")
  fi
  if [ -n "$simp" ]; then
    set -- $simp
    $GT simplify "$src" ".work/compressed/$id.simp.glb" --ratio "$1" --error "$2" > /dev/null
    $GT meshopt ".work/compressed/$id.simp.glb" "$tmp" > /dev/null
  else
    $GT meshopt "$src" "$tmp" > /dev/null
  fi
  sha=$(shasum -a 256 "$tmp" | cut -c1-64)
  h8=${sha:0:8}
  rm -f "$OUT/$id".*.glb
  cp "$tmp" "$OUT/$id.$h8.glb"
  bytes=$(stat -f%z "$OUT/$id.$h8.glb")
  node -e "const fs=require('fs');const f=JSON.parse(fs.readFileSync('.work/files.json','utf8'));f['$id']={kind:'$kind',path:'/anatomy/$id.$h8.glb',bytes:$bytes,sha256:'$sha'};fs.writeFileSync('.work/files.json',JSON.stringify(f,null,1))"
  echo "$id -> $id.$h8.glb ($bytes bytes)"
done
```

Run `chmod +x tools/anatomy/compress.sh`.

- [ ] **Step 2: Add the immutable cache header**

`next.config.js` becomes:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  async headers() {
    // Learn scene files carry a content hash in their name, so they can be cached forever.
    return [{ source: '/anatomy/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]
  },
}

module.exports = nextConfig
```

- [ ] **Step 3: Write the licence file**

`public/anatomy/LICENSE.md`:

```markdown
# Licences for the files in this folder

The 3D scenes here (`*.glb`) are derived from Z-Anatomy, the libre 3D atlas of anatomy
(https://www.z-anatomy.com, https://github.com/Z-Anatomy/Models-of-human-anatomy),
licensed Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).
Z-Anatomy itself derives from BodyParts3D, © The Database Center for Life Science,
licensed CC Attribution 4.0 International.

The joint scenes use the region method and configurations of maikleonhg/atlas
(https://github.com/maikleonhg/atlas), CC BY-SA 4.0.

The definition texts in `data/anatomy/generated/structures.json` are the Wikipedia-derived
texts shipped inside Z-Anatomy, CC BY-SA.

These derived files are published under CC BY-SA 4.0. The wod.coach application code and
the coach's own notes are separate works and are not covered by this notice.

Attribution line: "Z-Anatomy, CC BY-SA 4.0, based on BodyParts3D © The Database Center for
Life Science, CC BY 4.0; region method from maikleonhg/atlas, CC BY-SA 4.0."
```

- [ ] **Step 4: Run it and check sizes against the budgets**

```bash
bash tools/anatomy/compress.sh
cat tools/anatomy/.work/files.json
```

Expected: eleven lines `id -> id.xxxxxxxx.glb (bytes)`; `public/anatomy/` holds eleven `.glb` files plus `LICENSE.md`; knee is 692,900 bytes (±1%), muscles about 2.06 MB. Joint files must be under 1,200,000 bytes and system files under 3,000,000. If `skeleton` is over, lower `ratio` in its allowlist (0.1 → 0.07) and rebuild that one system (Task 4 Step 5 for `skeleton`, then this script); if `heart`, `breathing` or `nerves` are over, lower `curveResolution` to 3 and `bevelResolution` to 1 first.

- [ ] **Step 5: Commit the pipeline step (assets come with Task 9)**

```bash
git add tools/anatomy/compress.sh next.config.js public/anatomy/LICENSE.md
git commit -m "anatomy: meshopt compression to hashed assets, immutable cache header, licence file"
```

---

### Task 7: Authored content: scene copy, seeded roles, coach notes, shared types

**Files:**
- Create: `lib/learn-types.ts`, `tools/anatomy/seed_roles.py`, `data/anatomy/authored/scenes.json`, `data/anatomy/authored/roles.json` (seeded by the script), `data/anatomy/authored/coach-notes.json`

**Interfaces:**
- Produces: the types every later task imports from `lib/learn-types.ts`; the authored file shapes `merge.ts` reads.

- [ ] **Step 1: Write the shared types**

`lib/learn-types.ts`:

```ts
/** Shapes of data/anatomy/learn.json, produced by tools/anatomy/merge.ts and read by lib/learn.ts. */

export type Kind = "muscle" | "bone" | "vessel" | "nerve" | "organ" | "other"
export type SystemId = "muscles" | "skeleton" | "heart" | "breathing" | "nerves"
export type Role = "agonist" | "antagonist" | "synergist" | "stabilizer"

export type Structure = {
  id: string
  label: string
  system: SystemId
  kind: Kind
  definition?: { text: string; source: "Z-Anatomy"; license: "CC-BY-SA-4.0" }
  coachNote?: string
  /** sceneId -> glTF node names (both sides) that draw this structure in that scene. */
  nodes: Record<string, string[]>
}

export type SceneFile = { path: string; bytes: number; sha256: string }

export type Layer = { id: string; label: string; structures: string[]; defaultOn: boolean }

export type Movement = {
  id: string
  label: string
  range: [number, number]
  pivot: [number, number, number]
  axis: [number, number, number]
  sign: 1 | -1
  roles: Record<string, Role>
  coachNote?: string
}

export type Scene = {
  id: string
  kind: "joint" | "system"
  title: string
  blurb: string
  file: SceneFile
  structures: string[]
  layers?: Layer[]
  movement?: Movement
}

export type Learn = {
  generatedAt: string
  license: string
  scenes: Scene[]
  structures: Record<string, Structure>
}

/** data/anatomy/authored/scenes.json entries. */
export type AuthoredScene = {
  id: string
  kind: "joint" | "system"
  title: string
  blurb: string
  movement?: { label: string; coachNote?: string }
  layers?: Layer[]
}

export type AuthoredRoles = Record<string, { range: [number, number]; roles: Record<string, Role> }>
```

- [ ] **Step 2: Write the scene copy**

`data/anatomy/authored/scenes.json` (Ryan edits titles and blurbs freely; ids and kinds are fixed by the pipeline):

```json
[
  { "id": "knee", "kind": "joint", "title": "Knee", "blurb": "The hinge you load every squat, lunge and step. Bend it and watch the hamstrings pull while the quads let go.", "movement": { "label": "Knee flexion" } },
  { "id": "hip", "kind": "joint", "title": "Hip", "blurb": "The biggest joint in the body and the engine of the squat and the deadlift. Flex it and see what the hip flexors and glutes are doing.", "movement": { "label": "Hip flexion" } },
  { "id": "shoulder", "kind": "joint", "title": "Shoulder", "blurb": "The most mobile joint you own, held together by muscle more than bone. Raise the arm and watch the deltoid and the rotator cuff share the work.", "movement": { "label": "Shoulder abduction" } },
  { "id": "elbow", "kind": "joint", "title": "Elbow", "blurb": "A simple hinge with three muscles that bend it and one big one that straightens it. Curl and see which head does what.", "movement": { "label": "Elbow flexion" } },
  { "id": "lumbar", "kind": "joint", "title": "Lumbar spine", "blurb": "Five vertebrae, the discs between them, and the muscles that brace and bend them. This is what a neutral spine actually means.", "movement": { "label": "Trunk flexion" } },
  { "id": "neck", "kind": "joint", "title": "Neck", "blurb": "Seven vertebrae and a lot of small muscles. Nod forward and see what holds the head up all day.", "movement": { "label": "Neck flexion" } },
  { "id": "muscles", "kind": "system", "title": "Muscular system", "blurb": "Every skeletal muscle in the body, each one a structure you can tap. Spin it, find what hurts after leg day, and read what it does." },
  { "id": "skeleton", "kind": "system", "title": "Skeletal system", "blurb": "The frame the muscles pull on. Bones are living tissue and they adapt to load the same way muscle does." },
  { "id": "heart", "kind": "system", "title": "Heart and circulation", "blurb": "Four chambers and the main roads out of them. This is the pump that conditioning trains.",
    "layers": [
      { "id": "heart", "label": "Heart", "defaultOn": true, "structures": ["right-atrium", "right-ventricle", "left-atrium", "left-ventricle", "pulmonary-trunk", "right-coronary-artery", "left-coronary-artery", "circumflex-artery-of-heart", "coronary-sinus"] },
      { "id": "arteries", "label": "Arteries", "defaultOn": true, "structures": ["ascending-aorta", "thoracic-aorta", "abdominal-aorta", "left-pulmonary-artery", "right-common-carotid-artery", "left-common-carotid-artery", "internal-carotid-artery", "external-carotid-artery", "right-subclavian-artery", "left-subclavian-artery", "axillary-artery", "brachial-artery", "radial-artery", "ulnar-artery", "common-iliac-artery", "external-iliac-artery", "internal-iliac-artery", "femoral-artery", "deep-femoral-artery", "popliteal-artery", "anterior-tibial-artery", "posterior-tibial-artery"] },
      { "id": "veins", "label": "Veins", "defaultOn": true, "structures": ["right-superior-pulmonary-vein", "superior-vena-cava", "right-brachiocephalic-vein", "left-brachiocephalic-vein", "internal-jugular-vein", "external-jugular-vein"] }
    ] },
  { "id": "breathing", "kind": "system", "title": "Breathing", "blurb": "Air in through the trachea, down the bronchi, into two lungs. The diaphragm does most of the work and the muscles around the ribs do the rest.",
    "layers": [
      { "id": "airway", "label": "Airway and lungs", "defaultOn": true, "structures": ["trachea", "right-main-bronchus", "left-main-bronchus", "intermediate-bronchus", "right-superior-lobar-bronchus", "middle-lobar-bronchus", "right-inferior-lobar-bronchus", "left-superior-lobar-bronchus", "left-inferior-lobar-bronchus", "superior-lobe-of-right-lung", "middle-lobe-of-right-lung", "inferior-lobe-of-right-lung", "superior-lobe-of-left-lung", "inferior-lobe-of-left-lung"] },
      { "id": "muscles", "label": "Breathing muscles", "defaultOn": true, "structures": ["diaphragm", "external-intercostal-muscles", "internal-intercostal-muscles", "innermost-intercostal-muscles", "scalenus-anterior-muscle", "scalenus-medius-muscle", "scalenus-posterior-muscle", "sternocleidomastoid-muscle", "serratus-posterior-superior-muscle", "serratus-posterior-inferior-muscle", "transversus-thoracis-muscle"] }
    ] },
  { "id": "nerves", "kind": "system", "title": "Brain and nerves", "blurb": "The wiring. Every rep starts as a signal here, and strength in the first weeks of training is mostly this system learning the movement.",
    "layers": [
      { "id": "brain", "label": "Brain", "defaultOn": true, "structures": ["midbrain", "pons", "medulla-oblongata", "thalamus", "hypothalamus"] },
      { "id": "nerves", "label": "Nerves", "defaultOn": true, "structures": ["roots-of-brachial-plexus", "superior-trunk-of-brachial-plexus", "middle-trunk-of-brachial-plexus", "inferior-trunk-of-brachial-plexus", "posterior-cord-of-brachial-plexus", "axillary-nerve", "musculocutaneous-nerve", "radial-nerve", "median-nerve", "ulnar-nerve", "femoral-nerve", "obturator-nerve", "sciatic-nerve", "superficial-fibular-nerve", "deep-fibular-nerve", "vagus-nerve-x"] }
    ] }
]
```

Every structure added to `nerves.allowlist.json` in Task 4 Step 4 must also be added to the matching layer here, as its slug (lower case, non-alphanumerics to hyphens, side suffix dropped). `merge.ts` fails on any layer id that is not in the scene, so a mismatch is caught at build time.

- [ ] **Step 3: Write the role seeder and run it once**

`tools/anatomy/seed_roles.py`:

```python
# Seeds data/anatomy/authored/roles.json ONCE from the atlas movement data (CC BY-SA 4.0).
# The atlas marks each muscle ag/an/si/ne for the region's movement; ne (not involved) is dropped.
# Never overwrites: delete roles.json by hand if you really want a fresh seed.
import json, os, re, sys, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DEST = os.path.join(ROOT, 'data', 'anatomy', 'authored', 'roles.json')
if os.path.exists(DEST):
    print('roles.json exists; not touching it'); sys.exit(0)
MAP = {'knee': 'rodilla', 'hip': 'cadera', 'shoulder': 'hombro', 'elbow': 'codo', 'lumbar': 'lumbar', 'neck': 'cuello'}
ROLE = {'ag': 'agonist', 'an': 'antagonist', 'si': 'synergist'}
def slugify(name):   # must match lib/learn-slug.ts
    base = re.sub(r'\.(r|l)$', '', name).lower()
    base = ''.join(c for c in unicodedata.normalize('NFD', base) if not unicodedata.combining(c))
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', base))
out = {}
for sid, aid in MAP.items():
    f = json.load(open(os.path.join(HERE, '.work', 'atlas', 'pipeline', 'regions', f'{aid}.fichas.json'), encoding='utf-8'))
    m = f['_movimientos'][0]
    out[sid] = {'range': m['rango'], 'roles': {slugify(k): ROLE[v] for k, v in m['roles'].items() if v in ROLE}}
os.makedirs(os.path.dirname(DEST), exist_ok=True)
json.dump(out, open(DEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('seeded', DEST, {k: len(v['roles']) for k, v in out.items()})
```

Run: `python3 tools/anatomy/seed_roles.py`
Expected: `seeded .../roles.json {'knee': N, ...}` where each N is the number of muscles the atlas marks as involved, between 12 and 30 per joint. Open the file: `knee.roles["long-head-of-biceps-femoris"]` is `"agonist"` and `knee.roles["rectus-femoris-muscle"]` is `"antagonist"`; `knee.range` is `[0, 130]`.

- [ ] **Step 4: Write the coach notes file with one example**

`data/anatomy/authored/coach-notes.json`:

```json
{
  "rectus-femoris-muscle": "The only quad that also crosses the hip, which is why a tight rectus femoris pulls the pelvis forward and shows up as an arched low back in a squat."
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/learn-types.ts tools/anatomy/seed_roles.py data/anatomy/authored/scenes.json data/anatomy/authored/roles.json data/anatomy/authored/coach-notes.json
git commit -m "anatomy: authored scene copy, seeded movement roles, coach notes, shared types"
```

---

### Task 8: Merge generated and authored content into learn.json

**Files:**
- Create: `tools/anatomy/merge.ts`, `tools/anatomy/merge.test.ts`

**Interfaces:**
- Consumes: `lib/learn-types.ts`, `lib/learn-slug.ts`, `lib/text.ts` (`noLongDashes`), `tools/anatomy/glb.ts`.
- Produces: `mergeLearn(inputs: MergeInputs): Learn` (pure, tested) and, as a CLI, `data/anatomy/generated/structures.json`, `data/anatomy/generated/scenes.json`, `data/anatomy/learn.json`.

- [ ] **Step 1: Write the failing tests**

`tools/anatomy/merge.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { mergeLearn, clipDefinition, type MergeInputs } from "./merge"

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

test("a scene with no built file fails by name", () => {
  const i = inputs()
  delete i.files.muscles
  assert.throws(() => mergeLearn(i), /no built file.*muscles/)
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `./merge`.

- [ ] **Step 3: Write the merge**

`tools/anatomy/merge.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { baseName, labelFrom, slugify } from "../../lib/learn-slug"
import { noLongDashes } from "../../lib/text"
import type { AuthoredRoles, AuthoredScene, Kind, Learn, Scene, Structure, SystemId } from "../../lib/learn-types"
import { meshNodeNames, readGlbJson } from "./glb"

export type MergeInputs = {
  files: Record<string, { kind: "region" | "system"; path: string; bytes: number; sha256: string }>
  nodesByScene: Record<string, string[]>
  regionIndex: Record<string, { bones: string[]; muscles: string[]; attach: string[] }>
  regionMeta: Record<string, { pivot: number[]; axis: number[]; sign: number }>
  systemIndex: Record<string, { objects: { name: string; kind: Kind }[]; missing: string[] }>
  definitions: Record<string, string>
  authored: { scenes: AuthoredScene[]; roles: AuthoredRoles; coachNotes: Record<string, string> }
  now?: string
}

const LICENSE = "Geometry and definitions CC BY-SA 4.0: Z-Anatomy (from BodyParts3D © DBCLS, CC BY 4.0), region method maikleonhg/atlas. See public/anatomy/LICENSE.md."
const DEFINITION_MAX = 600

/** Cuts at the last sentence end that fits; falls back to a hard cut with an ellipsis. */
export function clipDefinition(text: string, max = DEFINITION_MAX) {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const end = Math.max(head.lastIndexOf(". "), head.endsWith(".") ? head.length - 1 : -1)
  return end >= 0 ? head.slice(0, end + 1) : head.trimEnd() + "…"
}

function systemFor(kind: Kind, scene: AuthoredScene): SystemId {
  if (kind === "bone") return "skeleton"
  if (kind === "muscle") return "muscles"
  if (kind === "vessel") return "heart"
  if (kind === "nerve") return "nerves"
  return scene.kind === "system" ? (scene.id as SystemId) : "muscles"
}

export function mergeLearn(i: MergeInputs): Learn {
  const structures: Record<string, Structure> = {}
  const scenes: Scene[] = []

  for (const a of i.authored.scenes) {
    const file = i.files[a.id]
    if (!file) throw new Error(`no built file for scene ${a.id}`)
    const nodes = i.nodesByScene[a.id] ?? []
    const kindOf = (name: string): Kind | "attach" | null => {
      if (a.kind === "joint") {
        const idx = i.regionIndex[a.id]
        if (!idx) throw new Error(`no region index for ${a.id}`)
        if (idx.attach.includes(name)) return "attach"
        if (idx.bones.includes(name)) return "bone"
        if (idx.muscles.includes(name)) return "muscle"
        return null
      }
      return i.systemIndex[a.id]?.objects.find((o) => o.name === name)?.kind ?? null
    }
    const ids = new Set<string>()
    for (const name of nodes) {
      const kind = kindOf(name)
      if (kind === null || kind === "attach") continue
      const id = slugify(name)
      const s = (structures[id] ??= { id, label: labelFrom(baseName(name)), system: systemFor(kind, a), kind, nodes: {} })
      ;(s.nodes[a.id] ??= []).push(name)
      ids.add(id)
    }
    const ordered = [...ids].sort((x, y) => structures[x].label.localeCompare(structures[y].label))
    const scene: Scene = { id: a.id, kind: a.kind, title: a.title, blurb: noLongDashes(a.blurb), file: { path: file.path, bytes: file.bytes, sha256: file.sha256 }, structures: ordered }

    if (a.kind === "joint") {
      const meta = i.regionMeta[a.id]
      const roles = i.authored.roles[a.id]
      if (!meta || !roles || !a.movement) throw new Error(`joint scene ${a.id} needs meta, roles and an authored movement label`)
      for (const id of Object.keys(roles.roles)) if (!ids.has(id)) throw new Error(`role for ${id} but scene ${a.id} does not draw it`)
      scene.movement = {
        id: "flex", label: a.movement.label, range: roles.range,
        pivot: meta.pivot as [number, number, number], axis: meta.axis as [number, number, number], sign: meta.sign < 0 ? -1 : 1,
        roles: roles.roles, ...(a.movement.coachNote ? { coachNote: noLongDashes(a.movement.coachNote) } : {}),
      }
    }
    if (a.layers) {
      for (const l of a.layers) for (const id of l.structures) if (!ids.has(id)) throw new Error(`layer ${l.id} in ${a.id} names ${id}, which the scene does not draw`)
      scene.layers = a.layers
    }
    scenes.push(scene)
  }

  for (const s of Object.values(structures)) {
    const first = Object.values(s.nodes)[0]?.[0]
    const text = first ? i.definitions[baseName(first)] : undefined
    if (text) s.definition = { text: clipDefinition(noLongDashes(text)), source: "Z-Anatomy", license: "CC-BY-SA-4.0" }
  }
  for (const [id, note] of Object.entries(i.authored.coachNotes)) {
    if (!structures[id]) throw new Error(`coach note for unknown structure ${id}`)
    structures[id].coachNote = noLongDashes(note)
  }
  return { generatedAt: i.now ?? new Date().toISOString(), license: LICENSE, scenes, structures }
}

/** CLI: reads the pipeline's .work output and the authored folder, writes generated/ and learn.json. */
function main() {
  const here = __dirname
  const root = join(here, "..", "..")
  const work = join(here, ".work")
  const authoredDir = join(root, "data", "anatomy", "authored")
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8"))
  const files = read(join(work, "files.json")) as MergeInputs["files"]
  const nodesByScene: Record<string, string[]> = {}
  for (const [id, f] of Object.entries(files)) nodesByScene[id] = meshNodeNames(readGlbJson(join(root, "public", f.path)))
  const regionIndex: MergeInputs["regionIndex"] = {}
  const regionMeta: MergeInputs["regionMeta"] = {}
  const systemIndex: MergeInputs["systemIndex"] = {}
  for (const [id, f] of Object.entries(files)) {
    if (f.kind === "region") {
      regionIndex[id] = read(join(work, "regions", `${id}.index.json`))
      regionMeta[id] = read(join(work, "regions", `${id}.meta.json`))
    } else systemIndex[id] = read(join(work, "systems", `${id}.index.json`))
  }
  const out = mergeLearn({
    files, nodesByScene, regionIndex, regionMeta, systemIndex,
    definitions: read(join(work, "definitions.json")),
    authored: { scenes: read(join(authoredDir, "scenes.json")), roles: read(join(authoredDir, "roles.json")), coachNotes: read(join(authoredDir, "coach-notes.json")) },
  })
  const gen = join(root, "data", "anatomy", "generated")
  mkdirSync(gen, { recursive: true })
  writeFileSync(join(gen, "structures.json"), JSON.stringify(out.structures, null, 1))
  writeFileSync(join(gen, "scenes.json"), JSON.stringify(out.scenes, null, 1))
  writeFileSync(join(root, "data", "anatomy", "learn.json"), JSON.stringify(out))
  console.log(`merged ${out.scenes.length} scenes, ${Object.keys(out.structures).length} structures`)
}

if (process.argv[1]?.endsWith("merge.ts")) {
  if (!existsSync(join(__dirname, ".work", "files.json"))) throw new Error("run compress.sh first")
  main()
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: the seven merge tests PASS (plus the earlier ones).

- [ ] **Step 5: Run the merge for real**

Run: `npx tsx tools/anatomy/merge.ts`
Expected: `merged 11 scenes, N structures` with N between 800 and 1,100 (the muscular system alone is about 340 unique base names, the skeleton about 500, plus vessels, nerves and organs). If it throws on a layer or role name, fix the authored file it names (the nerves layer from Task 7 Step 2 is the likely one) and rerun.

Spot-check: `node -e "const l=require('./data/anatomy/learn.json'); const s=l.structures['rectus-femoris-muscle']; console.log(s.label, s.system, Object.keys(s.nodes), s.definition.text.slice(0,80), '|', s.coachNote)"`
Expected: `Rectus femoris muscles [ ... ]` where the list includes `knee` and `muscles`, then `The quadriceps femoris muscle, also called ... | The only quad that also crosses the hip, ...`

- [ ] **Step 6: Commit**

```bash
git add tools/anatomy/merge.ts tools/anatomy/merge.test.ts
git commit -m "anatomy: merge generated geometry with authored content into learn.json"
```

---

### Task 9: Verify, the one-command build, and the committed assets

**Files:**
- Create: `tools/anatomy/verify.ts`, `tools/anatomy/verify.test.ts`, `tools/anatomy/build.sh`
- Modify: `package.json` (scripts `anatomy:build`, `anatomy:verify`)
- Commit: `public/anatomy/*.glb`, `data/anatomy/generated/*.json`, `data/anatomy/learn.json`

**Interfaces:**
- Produces: `verifyLearn(learn: Learn, opts: { bytesOf: (path: string) => number | null; missing: Record<string, string[]> }): string[]` (errors, empty when clean); `npm run anatomy:build`; `npm run anatomy:verify`.

- [ ] **Step 1: Write the failing tests**

`tools/anatomy/verify.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `./verify`.

- [ ] **Step 3: Write verify**

`tools/anatomy/verify.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Learn } from "../../lib/learn-types"
import { readGlbJson, triangleCount } from "./glb"

/** Bytes per scene file, from the spec. */
export const BUDGET = { joint: 1_200_000, system: 3_000_000 } as const

export function verifyLearn(learn: Learn, opts: { bytesOf: (path: string) => number | null; missing: Record<string, string[]> }): string[] {
  const errors: string[] = []
  for (const s of learn.scenes) {
    const bytes = opts.bytesOf(s.file.path)
    if (bytes === null) errors.push(`${s.id}: file ${s.file.path} not found`)
    else if (bytes > BUDGET[s.kind]) errors.push(`${s.id}: ${bytes} bytes is over budget (${BUDGET[s.kind]})`)
    if (s.structures.length === 0) errors.push(`${s.id}: no structures`)
    for (const id of s.structures) if (!learn.structures[id]) errors.push(`${s.id}: lists ${id}, which has no structure record`)
    for (const name of opts.missing[s.id] ?? []) errors.push(`${s.id}: allowlist name "${name}" matched nothing in the source`)
    if (s.kind === "joint" && !s.movement) errors.push(`${s.id}: joint scene without a movement`)
  }
  return errors
}

function main() {
  const root = join(__dirname, "..", "..")
  const learn = JSON.parse(readFileSync(join(root, "data", "anatomy", "learn.json"), "utf8")) as Learn
  const missing: Record<string, string[]> = {}
  const sysDir = join(__dirname, ".work", "systems")
  if (existsSync(sysDir))
    for (const f of readdirSync(sysDir).filter((f) => f.endsWith(".index.json"))) {
      const idx = JSON.parse(readFileSync(join(sysDir, f), "utf8")) as { id: string; missing: string[] }
      missing[idx.id] = idx.missing
    }
  const errors = verifyLearn(learn, {
    bytesOf: (p) => (existsSync(join(root, "public", p)) ? statSync(join(root, "public", p)).size : null),
    missing,
  })
  for (const s of learn.scenes) {
    const p = join(root, "public", s.file.path)
    if (existsSync(p)) console.log(`${s.id.padEnd(10)} ${String(s.file.bytes).padStart(9)} bytes  ${triangleCount(readGlbJson(p)).toLocaleString().padStart(11)} tris  ${s.structures.length} structures`)
  }
  if (errors.length) {
    for (const e of errors) console.error("✗", e)
    process.exit(1)
  }
  console.log("verify: ok")
}

if (process.argv[1]?.endsWith("verify.ts")) main()
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: all verify tests PASS.

- [ ] **Step 5: Write the one-command build and the scripts**

`tools/anatomy/build.sh`:

```bash
#!/usr/bin/env bash
# Full pipeline: fetch -> regions -> systems -> definitions -> compress -> merge -> verify.
set -euo pipefail
cd "$(dirname "$0")"
B="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
[ -x "$B" ] || { echo "Blender not found at $B (set BLENDER=)" >&2; exit 1; }
bash fetch.sh
python3 seed_roles.py
for id in knee hip shoulder elbow lumbar neck; do
  echo "» region $id"; "$B" -b --python build_region.py -- "$id" > ".work/$id.log" 2>&1 || { tail -20 ".work/$id.log" >&2; exit 1; }
  grep -q ' done$' ".work/$id.log" || { echo "region $id did not finish; see .work/$id.log" >&2; exit 1; }
done
for id in muscles skeleton heart breathing nerves; do
  echo "» system $id"; "$B" -b --python build_system.py -- "$id" > ".work/sys-$id.log" 2>&1 || { tail -20 ".work/sys-$id.log" >&2; exit 1; }
  grep -q ' done$' ".work/sys-$id.log" || { echo "system $id did not finish; see .work/sys-$id.log" >&2; exit 1; }
done
echo "» definitions"; "$B" -b --python extract_text.py > .work/text.log 2>&1 || { tail -20 .work/text.log >&2; exit 1; }
bash compress.sh
npx tsx merge.ts
npx tsx verify.ts
```

Run `chmod +x tools/anatomy/build.sh`. In `package.json` `scripts`, add:

```json
"anatomy:build": "bash tools/anatomy/build.sh",
"anatomy:verify": "tsx tools/anatomy/verify.ts"
```

- [ ] **Step 6: Run the full build**

Run: `npm run anatomy:build`
Expected: ends with a table of eleven scenes and `verify: ok`. Total of `public/anatomy/*.glb` under 20 MB (`du -ch public/anatomy/*.glb | tail -1`). If a system is over budget, adjust its allowlist as described in Task 6 Step 4 and rerun.

- [ ] **Step 7: Commit the pipeline, the assets and the merged content**

```bash
git add tools/anatomy/verify.ts tools/anatomy/verify.test.ts tools/anatomy/build.sh package.json public/anatomy data/anatomy/generated data/anatomy/learn.json
git commit -m "anatomy: verify budgets and references, one-command build, v1 scenes and learn.json"
```

---

### Task 10: App data access and the three.js dependency

**Files:**
- Create: `lib/learn.ts`, `tests/unit/learn.test.ts`
- Modify: `package.json` (dependencies)

**Interfaces:**
- Produces: `getScenes(): Scene[]`, `getJointScenes(): Scene[]`, `getSystemScenes(): Scene[]`, `getScene(id: string): Scene | null`, `structuresFor(scene: Scene): Record<string, Structure>`, `LEARN_CTA_URL`, `CREDITS_LINE` from `lib/learn.ts`.

- [ ] **Step 1: Add the dependency**

Run: `npm install three@^0.185.0 && npm install -D @types/three@^0.185.0`
Expected: `package.json` lists `"three": "^0.185.0"` under dependencies and `"@types/three"` under devDependencies; `package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

`tests/unit/learn.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to see it fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/learn`.

- [ ] **Step 4: Write the loader**

`lib/learn.ts`:

```ts
import learnJson from "../data/anatomy/learn.json"
import type { Learn, Scene, Structure } from "./learn-types"

/**
 * Learn section data. learn.json is produced by `npm run anatomy:build`
 * (tools/anatomy/merge.ts) and committed; nothing here touches the database.
 */
const data = learnJson as unknown as Learn

/** Where the public pages send people who want to train. */
export const LEARN_CTA_URL = "https://ryandobbeck.com"

/** One line of attribution shown under every scene. */
export const CREDITS_LINE =
  "3D model: Z-Anatomy, CC BY-SA 4.0, based on BodyParts3D by the Database Center for Life Science, CC BY 4.0. Definitions from Wikipedia via Z-Anatomy."

export const getScenes = () => data.scenes
export const getJointScenes = () => data.scenes.filter((s) => s.kind === "joint")
export const getSystemScenes = () => data.scenes.filter((s) => s.kind === "system")
export const getScene = (id: string): Scene | null => data.scenes.find((s) => s.id === id) ?? null
export const getStructure = (id: string): Structure | null => data.structures[id] ?? null

/** Only the structures a scene draws, so a page carries no more than it shows. */
export function structuresFor(scene: Scene): Record<string, Structure> {
  const out: Record<string, Structure> = {}
  for (const id of scene.structures) if (data.structures[id]) out[id] = data.structures[id]
  return out
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/learn.ts tests/unit/learn.test.ts package.json package-lock.json
git commit -m "learn: data access over learn.json, add three"
```

---

### Task 11: Viewer helpers that need no WebGL, with tests

**Files:**
- Create: `lib/learn-viewer.ts`, `tests/unit/learn-viewer.test.ts`

**Interfaces:**
- Produces: `originalName(o)`, `isTap(down, up, max?)`, `kindColor(kind, label)`, `morphInfluence(angle, max)`, `filterStructures(items, query)`, `hiddenByLayers(scene, on)`, `ROLE_LABEL`, `KIND_LABEL`, `accentColor(el)`, `PALETTE`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/learn-viewer.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { filterStructures, hiddenByLayers, isTap, kindColor, morphInfluence, originalName, PALETTE } from "../../lib/learn-viewer"
import type { Scene } from "../../lib/learn-types"

test("the original glTF name wins over the sanitised one", () => {
  assert.equal(originalName({ name: "Rectus_femoris_muscler", userData: { name: "Rectus femoris muscle.r" } }), "Rectus femoris muscle.r")
  assert.equal(originalName({ name: "distal", userData: {} }), "distal")
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
  assert.deepEqual([...hiddenByLayers(scene, new Set(["heart"]))!].sort(), ["femoral-artery"])
  assert.deepEqual([...hiddenByLayers(scene, new Set())!].sort(), ["coronary-sinus", "femoral-artery", "left-ventricle"])
  assert.equal(hiddenByLayers({ ...scene, layers: undefined }, new Set()), null)
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/learn-viewer`.

- [ ] **Step 3: Write the helpers**

`lib/learn-viewer.ts`:

```ts
import type { Kind, Role, Scene } from "./learn-types"

/**
 * Pure helpers for the Learn viewer. No three.js and no DOM beyond
 * getComputedStyle, so they run in node tests.
 */

/** GLTFLoader rewrites node names (spaces to _, dots removed) and keeps the original in userData. */
export const originalName = (o: { name: string; userData?: { name?: string } }) => o.userData?.name || o.name

/** A tap is pointer-up within `max` px of pointer-down; anything further is a drag. */
export const isTap = (down: [number, number] | null, up: [number, number], max = 6) =>
  !!down && Math.hypot(up[0] - down[0], up[1] - down[1]) <= max

/** A fixed anatomical palette that reads on every app theme. Only the selection highlight follows the theme. */
export const PALETTE = {
  bone: "#e9dfcb",
  muscle: "#b8574c",
  vessel: "#c0392b",
  vein: "#3b6fd6",
  nerve: "#e8c547",
  organ: "#c98b7a",
  other: "#9aa3b2",
} as const

const VEIN_RE = /\b(vein|vena cava|sinus)\b/i

export function kindColor(kind: Kind | null, label: string) {
  if (kind === "vessel") return VEIN_RE.test(label) ? PALETTE.vein : PALETTE.vessel
  return kind ? PALETTE[kind] : PALETTE.other
}

/** Muscle bulge: eased so the first degrees already show, clamped to the range. */
export const morphInfluence = (angle: number, max: number) =>
  max > 0 ? Math.pow(Math.min(Math.max(angle, 0), max) / max, 0.8) : 0

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

export function filterStructures<T extends { label: string }>(items: T[], query: string): T[] {
  const q = fold(query.trim())
  if (!q) return items
  return items.filter((i) => fold(i.label).includes(q))
}

/** Structures to hide given which layers are on; null when nothing is hidden. Structures in no layer always show. */
export function hiddenByLayers(scene: Scene, on: Set<string>): Set<string> | null {
  if (!scene.layers?.length) return null
  const inSome = new Set<string>()
  const inOn = new Set<string>()
  for (const l of scene.layers) for (const id of l.structures) { inSome.add(id); if (on.has(l.id)) inOn.add(id) }
  const hidden = new Set([...inSome].filter((id) => !inOn.has(id)))
  return hidden.size ? hidden : null
}

export const ROLE_LABEL: Record<Role, string> = {
  agonist: "works the movement",
  antagonist: "opposes it, controls the return",
  synergist: "assists",
  stabilizer: "holds the joint steady",
}

export const KIND_LABEL: Record<Kind, string> = { muscle: "Muscle", bone: "Bone", vessel: "Vessel", nerve: "Nerve", organ: "Organ", other: "Structure" }

/** The app theme's accent, read from the CSS variable; the brand red if it cannot be read. */
export function accentColor(el: Element | null) {
  if (!el || typeof getComputedStyle !== "function") return "#c1272d"
  const v = getComputedStyle(el).getPropertyValue("--app-accent").trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#c1272d"
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/learn-viewer.ts tests/unit/learn-viewer.test.ts
git commit -m "learn: viewer helpers (names, taps, palette, morph, search, layers) with tests"
```

---

### Task 12: The three.js viewer component

**Files:**
- Create: `components/learn/AnatomyViewer.tsx`

**Interfaces:**
- Consumes: `lib/learn-viewer.ts`, `lib/learn-slug.ts`, `lib/learn-types.ts`.
- Produces: default export `AnatomyViewer(props: ViewerProps)` with

```ts
export type ViewerProps = {
  scene: Scene
  structures: Record<string, Structure>
  selectedId: string | null
  onSelect: (id: string | null) => void
  angle: number                 // degrees, joint scenes only
  onAngle: (angle: number) => void
  playing: boolean
  hiddenIds: Set<string> | null // from hiddenByLayers
  onReady: () => void
  onError: (message: string) => void
}
```
and a test hook `window.__wodLearn = { ready: boolean; select(id: string | null): void; selected(): string | null; parts(): number }`.

- [ ] **Step 1: Write the component**

`components/learn/AnatomyViewer.tsx`:

```tsx
'use client'

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { slugify } from "@/lib/learn-slug"
import { accentColor, isTap, kindColor, morphInfluence, originalName } from "@/lib/learn-viewer"
import type { Kind, Scene, Structure } from "@/lib/learn-types"

export type ViewerProps = {
  scene: Scene
  structures: Record<string, Structure>
  selectedId: string | null
  onSelect: (id: string | null) => void
  angle: number
  onAngle: (angle: number) => void
  playing: boolean
  hiddenIds: Set<string> | null
  onReady: () => void
  onError: (message: string) => void
}

type Part = { mesh: THREE.Mesh; id: string | null; kind: Kind | null; mat: THREE.MeshStandardMaterial }

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
  dir: 1 | -1
  accent: THREE.Color
}

declare global {
  interface Window {
    __wodLearn?: { ready: boolean; select: (id: string | null) => void; selected: () => string | null; parts: () => number }
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
    renderer.setSize(el.clientWidth, el.clientHeight, false)
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

    const rig: Rig = { renderer, scene3, camera, controls, parts: [], byId: new Map(), distal: null, restQ: new THREE.Quaternion(), axisLocal: null, raf: 0, disposed: false, angle: propsRef.current.angle, dir: 1, accent: new THREE.Color(accentColor(el)) }
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
    ;(rig as Rig & { invalidate: () => void }).invalidate = invalidate
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

    // Tap to select: pointer up within 6 px of pointer down; empty space clears.
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY] }
    const onUp = (e: PointerEvent) => {
      if (!isTap(down, [e.clientX, e.clientY])) return
      const r = renderer.domElement.getBoundingClientRect()
      const ptr = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(rig.parts.filter((p) => p.mesh.visible && p.id).map((p) => p.mesh), false)[0]
      const part = hit ? rig.parts.find((p) => p.mesh === hit.object) : undefined
      propsRef.current.onSelect(part?.id ?? null)
    }
    renderer.domElement.addEventListener("pointerdown", onDown)
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
            const id = slugify(originalName(mesh))
            const s = structures[id] ?? null
            const kind = s?.kind ?? null
            const mat = new THREE.MeshStandardMaterial({ color: kindColor(kind, s?.label ?? ""), roughness: kind === "bone" ? 0.72 : 0.55, metalness: 0, transparent: true, opacity: 1 })
            mesh.material = mat
            mesh.frustumCulled = false
            if (!s) mesh.visible = false // insertion areas and anything not in the scene's structure list
            const part: Part = { mesh, id: s ? id : null, kind, mat }
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
        applySelection(rig, propsRef.current.selectedId)
        applyHidden(rig, propsRef.current.hiddenIds)
        window.__wodLearn = { ready: true, select: (id) => propsRef.current.onSelect(id), selected: () => propsRef.current.selectedId, parts: () => rig.parts.length }
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
  useEffect(() => { const r = rigRef.current; if (r) { applySelection(r, props.selectedId); invalidateRig(r) } }, [props.selectedId])
  useEffect(() => { const r = rigRef.current; if (r && !props.playing) { r.angle = props.angle; applyPose(r, props.scene, props.angle); invalidateRig(r) } }, [props.angle, props.playing, props.scene])
  useEffect(() => { const r = rigRef.current; if (r) { applyHidden(r, props.hiddenIds); invalidateRig(r) } }, [props.hiddenIds])
  useEffect(() => { const r = rigRef.current; if (r && props.playing) invalidateRig(r) }, [props.playing])

  return <div ref={host} className="h-full w-full" data-testid="anatomy-viewer" />
}

function invalidateRig(r: Rig) { (r as Rig & { invalidate?: () => void }).invalidate?.() }

function applyPose(r: Rig, scene: Scene, angle: number) {
  if (!r.distal || !r.axisLocal || !scene.movement) return
  r.distal.quaternion.copy(r.restQ).multiply(new THREE.Quaternion().setFromAxisAngle(r.axisLocal, scene.movement.sign * THREE.MathUtils.degToRad(angle)))
  const c = morphInfluence(angle, scene.movement.range[1])
  for (const p of r.parts) if (p.mesh.morphTargetInfluences?.length) p.mesh.morphTargetInfluences[0] = c
}

/** Selected: accent glow. Everything else that is not bone: 35% so the selection reads through. */
function applySelection(r: Rig, selectedId: string | null) {
  for (const p of r.parts) {
    const isSel = !!selectedId && p.id === selectedId
    p.mat.emissive.set(0x000000)
    if (isSel) p.mat.emissive.copy(r.accent).multiplyScalar(0.35)
    p.mat.opacity = selectedId && !isSel && p.kind !== "bone" ? 0.35 : 1
    p.mat.needsUpdate = true
  }
}

function applyHidden(r: Rig, hidden: Set<string> | null) {
  for (const p of r.parts) if (p.id) p.mesh.visible = !(hidden && hidden.has(p.id))
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/learn|lib/learn" || echo "learn files type-clean"`
Expected: `learn files type-clean`. If `three/examples/jsm/...` imports do not resolve, use the `three/addons/...` form for the same three paths; `@types/three` declares both.

- [ ] **Step 3: Commit**

```bash
git add components/learn/AnatomyViewer.tsx
git commit -m "learn: three.js scene viewer with tap select, movement rig, layers, render on demand"
```

The viewer is exercised end to end in Task 16; it has no page yet.

---

### Task 13: Scene view: card, list, layer chips, movement slider

**Files:**
- Create: `components/learn/StructureCard.tsx`, `components/learn/StructureList.tsx`, `components/learn/LayerChips.tsx`, `components/learn/MovementSlider.tsx`, `components/learn/SceneView.tsx`

**Interfaces:**
- Consumes: `AnatomyViewer` (Task 12), helpers (Task 11), types.
- Produces: `SceneView({ scene, structures, ctaUrl? }: { scene: Scene; structures: Record<string, Structure>; ctaUrl?: string })`, a client component; `?poster=1` in the URL hides everything but the canvas.

- [ ] **Step 1: Write the structure card**

`components/learn/StructureCard.tsx`:

```tsx
import type { Role, Structure } from "@/lib/learn-types"
import { KIND_LABEL, ROLE_LABEL } from "@/lib/learn-viewer"

export default function StructureCard({ structure, role, movementLabel }: { structure: Structure | null; role: Role | null; movementLabel?: string }) {
  if (!structure) {
    return (
      <div data-testid="structure-card" className="rounded-2xl border border-app-border bg-app-surface p-4">
        <h2 className="font-display text-xl font-bold">Tap a structure</h2>
        <p className="text-sm text-app-muted">Drag to turn, pinch to zoom. Tap anything to read what it is and what it does.</p>
      </div>
    )
  }
  return (
    <div data-testid="structure-card" className="space-y-3 rounded-2xl border border-app-border bg-app-surface p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-accent">
          {KIND_LABEL[structure.kind]}{role ? ` · ${role}` : ""}
        </p>
        <h2 className="font-display text-2xl font-bold leading-tight">{structure.label}</h2>
        {role && movementLabel && <p className="text-sm text-app-muted">In {movementLabel.toLowerCase()}: {ROLE_LABEL[role]}.</p>}
      </div>
      {structure.coachNote && (
        <div className="rounded-xl bg-app-surface2 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-accent">Coach&apos;s note</p>
          <p className="text-sm">{structure.coachNote}</p>
        </div>
      )}
      {structure.definition && (
        <div>
          <p className="text-sm text-app-text">{structure.definition.text}</p>
          <p className="mt-1 text-[11px] text-app-muted">Definition from Wikipedia via Z-Anatomy, CC BY-SA.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write the list**

`components/learn/StructureList.tsx`:

```tsx
'use client'

import { useState } from "react"
import type { Structure } from "@/lib/learn-types"
import { filterStructures, KIND_LABEL } from "@/lib/learn-viewer"

export default function StructureList({ items, selectedId, onSelect }: { items: Structure[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("")
  const shown = filterStructures(items, query)
  return (
    <div className="rounded-2xl border border-app-border bg-app-surface">
      <div className="p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search structures"
          aria-label="Search structures"
          className="h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-sm"
        />
      </div>
      <ul className="max-h-[40vh] overflow-y-auto px-2 pb-2 md:max-h-[48vh]">
        {shown.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-label={s.label}
              aria-pressed={s.id === selectedId}
              data-testid="structure-item"
              onClick={() => onSelect(s.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${s.id === selectedId ? "bg-app-accent text-app-accent-text" : "hover:bg-app-surface2"}`}
            >
              <span>{s.label}</span>
              <span className={`text-[11px] ${s.id === selectedId ? "" : "text-app-muted"}`}>{KIND_LABEL[s.kind]}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-4 text-sm text-app-muted">Nothing matches.</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Write the layer chips and the slider**

`components/learn/LayerChips.tsx`:

```tsx
import type { Layer } from "@/lib/learn-types"

export default function LayerChips({ layers, on, onToggle }: { layers: Layer[]; on: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Layers">
      {layers.map((l) => {
        const active = on.has(l.id)
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(l.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-app-accent bg-app-accent text-app-accent-text" : "border-app-border bg-app-surface text-app-muted"}`}
          >
            {l.label}
          </button>
        )
      })}
    </div>
  )
}
```

`components/learn/MovementSlider.tsx`:

```tsx
import type { Movement } from "@/lib/learn-types"

export default function MovementSlider({ movement, angle, playing, onAngle, onPlay }: { movement: Movement; angle: number; playing: boolean; onAngle: (a: number) => void; onPlay: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-3 py-2">
      <label htmlFor="learn-angle" className="whitespace-nowrap text-xs font-semibold text-app-muted">{movement.label}</label>
      <input
        id="learn-angle"
        type="range"
        min={movement.range[0]}
        max={movement.range[1]}
        step={1}
        value={Math.round(angle)}
        aria-label={movement.label}
        onChange={(e) => onAngle(Number(e.target.value))}
        className="flex-1 accent-app-accent"
      />
      <output data-testid="angle-out" className="min-w-[4ch] text-right font-mono text-xs">{Math.round(angle)}°</output>
      <button type="button" onClick={onPlay} className="rounded-lg border border-app-border px-2.5 py-1 text-xs font-semibold">{playing ? "Pause" : "Play"}</button>
    </div>
  )
}
```

Tailwind: `accent-app-accent` works because the config defines `app.accent` under `colors` and Tailwind 3 derives `accent-*` from colours.

- [ ] **Step 4: Write the scene view**

`components/learn/SceneView.tsx`:

```tsx
'use client'

import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import type { Scene, Structure } from "@/lib/learn-types"
import { hiddenByLayers } from "@/lib/learn-viewer"
import LayerChips from "./LayerChips"
import MovementSlider from "./MovementSlider"
import StructureCard from "./StructureCard"
import StructureList from "./StructureList"

const AnatomyViewer = dynamic(() => import("./AnatomyViewer"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-app-surface2" aria-hidden="true" />,
})

export default function SceneView({ scene, structures, ctaUrl }: { scene: Scene; structures: Record<string, Structure>; ctaUrl?: string }) {
  const poster = useSearchParams().get("poster") === "1"
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [angle, setAngle] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [layersOn, setLayersOn] = useState<Set<string>>(() => new Set((scene.layers ?? []).filter((l) => l.defaultOn).map((l) => l.id)))

  const items = useMemo(() => scene.structures.map((id) => structures[id]).filter(Boolean), [scene, structures])
  const hiddenIds = useMemo(() => hiddenByLayers(scene, layersOn), [scene, layersOn])
  const selected = selectedId ? structures[selectedId] ?? null : null
  const role = selectedId && scene.movement ? scene.movement.roles[selectedId] ?? null : null

  const toggleLayer = (id: string) => setLayersOn((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const canvas = (
    <div className={`relative overflow-hidden rounded-2xl border border-app-border bg-app-surface ${poster ? "h-[100vh] rounded-none border-0" : "h-[58vh] md:h-[70vh]"}`}>
      <AnatomyViewer
        scene={scene}
        structures={structures}
        selectedId={selectedId}
        onSelect={setSelectedId}
        angle={angle}
        onAngle={setAngle}
        playing={playing}
        hiddenIds={hiddenIds}
        onReady={() => setError(null)}
        onError={(m) => { setError(m); setPlaying(false) }}
      />
      {error && (
        <p role="alert" className="absolute inset-x-3 top-3 rounded-xl bg-app-surface/95 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {!poster && scene.layers && (
        <div className="absolute inset-x-3 top-3">
          <LayerChips layers={scene.layers} on={layersOn} onToggle={toggleLayer} />
        </div>
      )}
    </div>
  )

  if (poster) return canvas

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
      <div className="min-w-0 flex-1 space-y-3">
        {canvas}
        {scene.movement && (
          <MovementSlider movement={scene.movement} angle={angle} playing={playing} onAngle={(a) => { setPlaying(false); setAngle(a) }} onPlay={() => setPlaying((p) => !p)} />
        )}
      </div>
      <aside className="space-y-3 md:w-80 md:shrink-0" aria-label="Structure details">
        <StructureCard structure={selected} role={role} movementLabel={scene.movement?.label} />
        {ctaUrl && (
          <a href={ctaUrl} className="flex h-11 items-center justify-center rounded-xl bg-app-accent text-sm font-bold text-app-accent-text">
            Train with Ryan
          </a>
        )}
        <StructureList items={items} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
    </div>
  )
}
```

`useSearchParams` in a client component rendered from a static page needs a Suspense boundary; the pages in Task 14 wrap `SceneView` in `<Suspense>`.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/learn|lib/learn" || echo "learn files type-clean"`
Expected: `learn files type-clean`.

```bash
git add components/learn
git commit -m "learn: scene view with structure card, searchable list, layer chips and movement slider"
```

---

### Task 14: Public pages: index, scene, credits

**Files:**
- Create: `components/learn/SceneCards.tsx`, `components/learn/LearnCredits.tsx`, `app/learn/layout.tsx`, `app/learn/page.tsx`, `app/learn/[scene]/page.tsx`, `app/learn/credits/page.tsx`

**Interfaces:**
- Consumes: `lib/learn.ts`, `SceneView` (Task 13).
- Produces: routes `/learn`, `/learn/<sceneId>`, `/learn/credits`; `SceneCards({ scenes, base, heading })` and `LearnCredits()` reused by the client pages.

- [ ] **Step 1: Write the shared cards and credits line**

`components/learn/SceneCards.tsx`:

```tsx
import Link from "next/link"
import type { Scene } from "@/lib/learn-types"

/* eslint-disable @next/next/no-img-element -- posters are static files in public/anatomy/posters */

export default function SceneCards({ scenes, base, heading, intro }: { scenes: Scene[]; base: string; heading: string; intro: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-bold">{heading}</h2>
        <p className="text-sm text-app-muted">{intro}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {scenes.map((s) => (
          <li key={s.id}>
            <Link href={`${base}/${s.id}`} className="block overflow-hidden rounded-2xl border border-app-border bg-app-surface" aria-label={s.title}>
              <div className="aspect-[3/4] bg-app-surface2">
                <img src={`/anatomy/posters/${s.id}.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <h3 className="font-display text-lg font-bold leading-tight">{s.title}</h3>
                <p className="mt-1 line-clamp-3 text-xs text-app-muted">{s.blurb}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

`components/learn/LearnCredits.tsx`:

```tsx
import Link from "next/link"
import { CREDITS_LINE } from "@/lib/learn"

export default function LearnCredits({ creditsHref }: { creditsHref: string }) {
  return (
    <p className="text-[11px] leading-relaxed text-app-muted">
      {CREDITS_LINE} <Link href={creditsHref} className="underline">Credits</Link>
    </p>
  )
}
```

If `line-clamp-3` is not available (Tailwind below 3.3), add `@tailwindcss/line-clamp` or drop the class; check `npx tailwindcss --help` prints a 3.3+ version first.

- [ ] **Step 2: Write the public layout and index**

`app/learn/layout.tsx`:

```tsx
import Link from "next/link"

/** Public shell for /learn: the client theme tokens on the default dark look, no sign-in. */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app-theme="dark" className="min-h-screen bg-app-bg font-sans text-app-text">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-display text-xl font-bold tracking-wide">WOD.COACH</Link>
        <Link href="/learn" className="text-sm font-semibold text-app-muted">Learn</Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
    </div>
  )
}
```

`app/learn/page.tsx`:

```tsx
import type { Metadata } from "next"
import Link from "next/link"
import SceneCards from "@/components/learn/SceneCards"
import LearnCredits from "@/components/learn/LearnCredits"
import { getJointScenes, getSystemScenes, LEARN_CTA_URL } from "@/lib/learn"

export const metadata: Metadata = {
  title: "Learn anatomy · WOD.COACH",
  description: "Bend a knee and watch the hamstrings work. Spin the heart. Tap any muscle, bone, vessel or nerve and read what it does. Free, in your browser.",
}

export default function LearnIndex() {
  return (
    <div className="space-y-10">
      <section className="space-y-3 pt-4">
        <h1 className="font-display text-4xl font-bold leading-none md:text-5xl">Learn the body you train</h1>
        <p className="max-w-2xl text-app-muted">Real 3D anatomy, built from an open atlas. Bend the joints, turn the systems, tap anything to read what it does and how training changes it.</p>
        <a href={LEARN_CTA_URL} className="inline-flex h-11 items-center rounded-xl bg-app-accent px-5 text-sm font-bold text-app-accent-text">Train with Ryan</a>
      </section>
      <SceneCards scenes={getJointScenes()} base="/learn" heading="Joints: bend them" intro="Slide the joint through its range and watch which muscles work and which let go." />
      <SceneCards scenes={getSystemScenes()} base="/learn" heading="Systems: spin them" intro="The major structures of each system. Toggle layers, tap to read." />
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
```

- [ ] **Step 3: Write the scene page and the credits page**

`app/learn/[scene]/page.tsx`:

```tsx
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import SceneView from "@/components/learn/SceneView"
import LearnCredits from "@/components/learn/LearnCredits"
import { getScene, getScenes, LEARN_CTA_URL, structuresFor } from "@/lib/learn"

export function generateStaticParams() {
  return getScenes().map((s) => ({ scene: s.id }))
}

export function generateMetadata({ params }: { params: { scene: string } }): Metadata {
  const s = getScene(params.scene)
  if (!s) return {}
  return {
    title: `${s.title} in 3D · Learn · WOD.COACH`,
    description: s.blurb,
    openGraph: { title: `${s.title} in 3D`, description: s.blurb, images: [`/anatomy/posters/${s.id}.jpg`] },
  }
}

export default function LearnScenePage({ params }: { params: { scene: string } }) {
  const scene = getScene(params.scene)
  if (!scene) notFound()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold leading-none">{scene.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{scene.blurb}</p>
      </div>
      <Suspense fallback={<div className="h-[58vh] animate-pulse rounded-2xl bg-app-surface2 md:h-[70vh]" />}>
        <SceneView scene={scene} structures={structuresFor(scene)} ctaUrl={LEARN_CTA_URL} />
      </Suspense>
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
```

`app/learn/credits/page.tsx`:

```tsx
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Credits · Learn · WOD.COACH" }

export default function LearnCreditsPage() {
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed">
      <h1 className="font-display text-3xl font-bold">Credits and licences</h1>
      <p>The 3D scenes in Learn are built from <a href="https://www.z-anatomy.com" className="underline">Z-Anatomy</a>, the libre 3D atlas of anatomy by Gauthier Kervyn and contributors, licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline">CC BY-SA 4.0</a>. Z-Anatomy is based on <a href="https://lifesciencedb.jp/bp3d/" className="underline">BodyParts3D</a>, © The Database Center for Life Science, licensed CC BY 4.0.</p>
      <p>The joint scenes use the region method and configurations of <a href="https://github.com/maikleonhg/atlas" className="underline">maikleonhg/atlas</a>, CC BY-SA 4.0.</p>
      <p>Structure definitions are Wikipedia text as shipped inside Z-Anatomy, CC BY-SA. Coach&apos;s notes are written by Ryan Dobbeck and are not part of the open data.</p>
      <p>Our processed scene files are published under CC BY-SA 4.0; see <a href="/anatomy/LICENSE.md" className="underline">the licence file</a>.</p>
      <p>Learn is for education. It is not medical advice.</p>
    </article>
  )
}
```

- [ ] **Step 4: Run it and look**

Run: `npm run dev` (port 3011) and open `http://localhost:3011/learn`, then `/learn/knee`, then `/learn/heart`, then `/learn/credits`.
Expected: the index shows both card groups (poster images are missing until Task 17; the cards still render); the knee loads, tapping a muscle highlights it and fills the card, the slider bends the knee, Play sweeps; the heart shows three layer chips and toggling Veins hides the veins; credits renders. No console errors.

- [ ] **Step 5: Commit**

```bash
git add components/learn/SceneCards.tsx components/learn/LearnCredits.tsx app/learn
git commit -m "learn: public index, scene and credits pages"
```

---

### Task 15: Client pages and the Learn tab

**Files:**
- Create: `app/client/learn/page.tsx`, `app/client/learn/[scene]/page.tsx`
- Modify: `components/client/BottomNav.tsx`

**Interfaces:**
- Consumes: `requireClient` from `lib/require-client`, `SceneCards`, `SceneView`, `LearnCredits`.
- Produces: routes `/client/learn`, `/client/learn/<sceneId>`; a fifth bottom tab.

- [ ] **Step 1: Write the client pages**

`app/client/learn/page.tsx`:

```tsx
import SceneCards from "@/components/learn/SceneCards"
import LearnCredits from "@/components/learn/LearnCredits"
import { getJointScenes, getSystemScenes } from "@/lib/learn"
import { requireClient } from "@/lib/require-client"

export default async function ClientLearn() {
  await requireClient()
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold leading-none">Learn</h1>
        <p className="mt-1 text-sm text-app-muted">The body you train, in 3D. Bend the joints, turn the systems, tap anything.</p>
      </div>
      <SceneCards scenes={getJointScenes()} base="/client/learn" heading="Joints" intro="Slide through the range and watch the muscles work." />
      <SceneCards scenes={getSystemScenes()} base="/client/learn" heading="Systems" intro="Major structures, layer by layer." />
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
```

`app/client/learn/[scene]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { Suspense } from "react"
import SceneView from "@/components/learn/SceneView"
import LearnCredits from "@/components/learn/LearnCredits"
import { getScene, structuresFor } from "@/lib/learn"
import { requireClient } from "@/lib/require-client"

export default async function ClientLearnScene({ params }: { params: { scene: string } }) {
  await requireClient()
  const scene = getScene(params.scene)
  if (!scene) notFound()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold leading-none">{scene.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{scene.blurb}</p>
      </div>
      <Suspense fallback={<div className="h-[58vh] animate-pulse rounded-2xl bg-app-surface2" />}>
        <SceneView scene={scene} structures={structuresFor(scene)} />
      </Suspense>
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
```

The client shell (`app/client/layout.tsx`) is a `max-w-md` column, so the scene view stacks: canvas, slider, card, list. That is the intended phone layout.

- [ ] **Step 2: Add the tab**

In `components/client/BottomNav.tsx`, insert this entry into `tabs` between the History and Messages entries:

```tsx
  {
    href: "/client/learn",
    label: "Learn",
    match: (p: string) => p.startsWith("/client/learn"),
    icon: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
        <path d="M4 20.5V5.5" />
        <path d="M9 7h7M9 10.5h7" />
      </>
    ),
  },
```

and change the grid from `grid-cols-4` to `grid-cols-5`:

```tsx
      <div className="mx-auto grid max-w-md grid-cols-5">
```

- [ ] **Step 3: Check in the browser**

Run: with `npm run dev` running, sign in as a client (any client account in the preview database) and open `http://localhost:3011/client/learn`.
Expected: five tabs with Learn third and highlighted; the knee scene works inside the client shell; `/learn` still shows no bottom nav.

- [ ] **Step 4: Commit**

```bash
git add app/client/learn components/client/BottomNav.tsx
git commit -m "learn: client pages and the Learn tab"
```

---

### Task 16: End-to-end tests

**Files:**
- Create: `tests/learn.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: the `window.__wodLearn` hook (Task 12), `data-testid="structure-card"`, `data-testid="angle-out"`, the `Search structures` placeholder, list buttons named by label.

- [ ] **Step 1: Add a `learn` project with software WebGL**

In `playwright.config.ts`, change the `chromium` project to ignore the learn spec and add the project:

```ts
    {
      name: "chromium",
      testIgnore: /learn\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./.auth/coach.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "learn",
      testMatch: /learn\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
      },
      dependencies: ["setup"],
    },
```

- [ ] **Step 2: Write the tests**

`tests/learn.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test"
import learn from "../data/anatomy/learn.json"

/** Learn: public pages, the viewer's selection and movement, failure states, the client tab. */
test.use({ storageState: { cookies: [], origins: [] } })

const ready = (page: Page) => page.waitForFunction(() => window.__wodLearn?.ready === true, null, { timeout: 90_000 })

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("the index lists joints and systems, links the credits, and has no client nav", async ({ page }) => {
  await page.goto("/learn")
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/learn the body/i)
  await expect(page.getByRole("link", { name: "Knee" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Muscular system" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Credits" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Today" })).toHaveCount(0)
})

test("knee: selecting from the list fills the card with the role; the slider moves the angle", async ({ page }) => {
  await page.goto("/learn/knee")
  await ready(page)
  await page.getByPlaceholder("Search structures").fill("rectus")
  await page.getByRole("button", { name: "Rectus femoris", exact: true }).click()
  const card = page.getByTestId("structure-card")
  await expect(card).toContainText("Rectus femoris")
  await expect(card).toContainText("antagonist")
  await expect(card).toContainText("opposes it")
  await expect(card).toContainText("Coach's note")
  await expect(page.getByRole("link", { name: "Train with Ryan" })).toBeVisible()
  await page.getByRole("slider", { name: "Knee flexion" }).fill("90")
  await expect(page.getByTestId("angle-out")).toHaveText("90°")
  expect(await page.evaluate(() => window.__wodLearn?.selected())).toBe("rectus-femoris-muscle")
})

test("a tap on empty space clears the selection", async ({ page }) => {
  await page.goto("/learn/knee")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("femur"))
  await expect(page.getByTestId("structure-card")).toContainText("Femur")
  const canvas = page.locator("canvas")
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + 8, box.y + 8) // top-left corner: nothing is drawn there
  await expect(page.getByTestId("structure-card")).toContainText("Tap a structure")
})

test("a scene whose model is missing shows the error and the list still works", async ({ page }) => {
  await page.route("**/anatomy/elbow.*.glb", (route) => route.fulfill({ status: 404, body: "" }))
  await page.goto("/learn/elbow")
  await expect(page.getByRole("alert")).toContainText(/couldn't load/i, { timeout: 60_000 })
  await page.getByRole("button", { name: "Brachialis", exact: true }).click()
  await expect(page.getByTestId("structure-card")).toContainText("Brachialis")
})

test("losing the WebGL context shows the stopped message", async ({ page }) => {
  await page.goto("/learn/knee")
  await ready(page)
  await page.evaluate(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2") as WebGL2RenderingContext
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  })
  await expect(page.getByRole("alert")).toContainText(/3D view stopped/i)
})

test("scene files are cached as immutable", async ({ request }) => {
  const res = await request.head(learn.scenes[0].file.path)
  expect(res.ok()).toBeTruthy()
  expect(res.headers()["cache-control"]).toContain("immutable")
})

test("clients get a Learn tab that opens the same scenes", async ({ page }) => {
  await signInAsClient(page)
  await page.goto("/client/learn")
  await expect(page.getByRole("link", { name: "Learn" })).toHaveAttribute("aria-current", "page")
  await page.getByRole("link", { name: "Knee" }).click()
  await ready(page)
  await expect(page.getByRole("link", { name: "Train with Ryan" })).toHaveCount(0)
})
```

- [ ] **Step 3: Run the learn project**

Run: `npx playwright test --project=setup --project=learn`
Expected: 7 passed. The first run downloads nothing new; each scene load under software rendering takes a few seconds. If the empty-space tap test flakes because the model reaches the corner on a small window, change the click to `box.x + 8, box.y + box.height - 8`.

- [ ] **Step 4: Run the whole suite once to prove nothing else moved**

Run: `npm run test:e2e`
Expected: the existing projects still pass; the `chromium` project reports no `learn.spec.ts` tests.

- [ ] **Step 5: Commit**

```bash
git add tests/learn.spec.ts playwright.config.ts
git commit -m "learn: end-to-end tests under software WebGL"
```

---

### Task 17: Posters for the cards, the fallback and link previews

**Files:**
- Create: `scripts/anatomy-posters.ts`
- Modify: `package.json` (script), `components/learn/SceneView.tsx` (fallback image)
- Commit: `public/anatomy/posters/*.jpg`

**Interfaces:**
- Produces: `public/anatomy/posters/<sceneId>.jpg` (900×1200), `npm run anatomy:posters` (needs the dev server on 3011).

- [ ] **Step 1: Write the script**

`scripts/anatomy-posters.ts`:

```ts
import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import learn from "../data/anatomy/learn.json"

/**
 * Screenshots every scene's canvas from a running dev server (`npm run dev`, port 3011)
 * into public/anatomy/posters/<id>.jpg. Rerun after rebuilding assets.
 */
const base = process.env.POSTER_BASE ?? "http://localhost:3011"

async function main() {
  mkdirSync("public/anatomy/posters", { recursive: true })
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 })
  for (const s of learn.scenes) {
    await page.goto(`${base}/learn/${s.id}?poster=1`)
    await page.waitForFunction(() => window.__wodLearn?.ready === true, null, { timeout: 180_000 })
    await page.waitForTimeout(800)
    await page.locator("canvas").screenshot({ path: `public/anatomy/posters/${s.id}.jpg`, type: "jpeg", quality: 82 })
    console.log("poster", s.id)
  }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

In `package.json` `scripts`, add:

```json
"anatomy:posters": "tsx scripts/anatomy-posters.ts"
```

`window.__wodLearn` is declared globally in `AnatomyViewer.tsx`; if `tsx` complains it is not in scope here, add `/// <reference path="../components/learn/AnatomyViewer.tsx" />` at the top of the script, or cast `window as any` in the two `waitForFunction` calls.

- [ ] **Step 2: Show the poster when 3D is unavailable**

In `components/learn/SceneView.tsx`, add a `ready` state next to `error`:

```tsx
  const [ready, setReady] = useState(false)
```

and replace the `canvas` constant with this version, which draws the poster behind the viewer and lets the canvas cover it once the model has drawn (the renderer is transparent):

```tsx
  const canvas = (
    <div className={`relative overflow-hidden rounded-2xl border border-app-border bg-app-surface ${poster ? "h-[100vh] rounded-none border-0" : "h-[58vh] md:h-[70vh]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static poster from public/anatomy/posters */}
      <img src={`/anatomy/posters/${scene.id}.jpg`} alt="" aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity ${ready && !error ? "opacity-0" : "opacity-40"}`} />
      <div className="relative z-10 h-full">
        <AnatomyViewer
          scene={scene}
          structures={structures}
          selectedId={selectedId}
          onSelect={setSelectedId}
          angle={angle}
          onAngle={setAngle}
          playing={playing}
          hiddenIds={hiddenIds}
          onReady={() => { setReady(true); setError(null) }}
          onError={(m) => { setError(m); setReady(false); setPlaying(false) }}
        />
      </div>
      {error && (
        <p role="alert" className="absolute inset-x-3 top-3 z-20 rounded-xl bg-app-surface/95 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {!poster && scene.layers && (
        <div className="absolute inset-x-3 top-3 z-20">
          <LayerChips layers={scene.layers} on={layersOn} onToggle={toggleLayer} />
        </div>
      )}
    </div>
  )
```

In poster mode (`?poster=1`) the screenshot is of the canvas element itself, so the faded poster behind it never appears in a poster.

- [ ] **Step 3: Generate the posters**

Run: `npm run dev` in one terminal, then `npm run anatomy:posters`.
Expected: eleven `poster <id>` lines and eleven JPEGs under `public/anatomy/posters/`, each under 200 KB. Open `/learn`: every card has a picture.

- [ ] **Step 4: Commit**

```bash
git add scripts/anatomy-posters.ts package.json components/learn/SceneView.tsx public/anatomy/posters
git commit -m "learn: scene posters for cards, link previews and the no-WebGL fallback"
```

---

### Task 18: Final checks and the pull request

**Files:**
- Modify: `docs/ROADMAP.md` (one line under what shipped, if the file keeps such a list)

- [ ] **Step 1: Everything green**

Run, in order:

```bash
npm run test:unit
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run anatomy:verify
npm run build
npx playwright test --project=setup --project=learn
```

Expected: all pass; `npm run build` completes with `/learn` and the eleven `/learn/[scene]` pages listed as static.

- [ ] **Step 2: Size and licence check**

Run: `du -ch public/anatomy/*.glb | tail -1 && ls public/anatomy/LICENSE.md data/anatomy/learn.json`
Expected: total under 20 MB; both files present.

- [ ] **Step 3: Push and open the pull request**

```bash
gh auth switch --user rdobbeck
git push -u origin feat/learn-anatomy
gh pr create --base master --title "Learn: 3D anatomy, six joints and five systems" --body-file - <<'EOF'
Learn section: six joint scenes with a movement slider and five curated body systems, built from a pinned Z-Anatomy snapshot (CC BY-SA 4.0) by `tools/anatomy/`. Public at /learn, clients get a Learn tab.

Spec: docs/superpowers/specs/2026-10-14-learn-anatomy-design.md
Plan: docs/superpowers/plans/2026-10-14-learn-anatomy.md

Review on the preview: /learn/knee on a phone (Vercel sign-in needed on previews).

After merge: delete branch `spike/anatomy-3d` and the local `~/wodcoach-anatomy-spike` folder; they were the throwaway spike.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY
EOF
```

Expected: a PR URL. Do not merge; Ryan merges after trying the preview on his phone.
