# Learn: 3D anatomy for clients and the public

Date: 2026-10-14. Status: approved in conversation, pending written review.

## Why

Clients follow programs without knowing what a movement does to them. Ryan
wants a Learn section on wod.coach that teaches the body the way a coach
would: tap a muscle, see what it does, bend the joint and watch which muscles
work. The same material, published openly at `/learn`, is a reason for people
to find wod.coach and train with Ryan.

Research on 2026-10-14 settled the sources. The two `rdobbeck/anatomy*` repos
are not body models (one is an unlicensed organ viewer, the other an isometric
figure skill). The usable body is Z-Anatomy (CC BY-SA 4.0), which derives from
BodyParts3D (CC BY 4.0, relicensed Feb 2025). A knee-region spike built on
this Mac proved the pipeline: Blender 5.2 headless, 11 seconds per region,
693 KB, muscles that highlight and a joint that bends, deployed on a Vercel
preview. Full-system exports measured 2.1 MB for the whole muscular layer and
15 to 23 MB for vessel and nerve layers before curation, which is why systems
are curated below.

## What changes, in one paragraph

A build pipeline under `tools/anatomy/` turns a pinned Z-Anatomy snapshot into
content-hashed GLB files in `public/anatomy/` and generated JSON in
`data/anatomy/`. Ryan's own writing lives in `data/anatomy/authored/` and is
merged in, never overwritten. One React viewer component renders two kinds of
scene: joint scenes with a movement slider, and system scenes with curated
layers. Public pages at `/learn` and client pages at `/client/learn` (a fifth
bottom tab) share those components. No database changes.

## 1. Scope of v1

Joint scenes, right side only, each with one movement:

| id | Title | Movement | Source config |
|---|---|---|---|
| `knee` | Knee | flexion 0 to 130° | `rodilla` |
| `hip` | Hip | flexion | `cadera` |
| `shoulder` | Shoulder | flexion | `hombro` |
| `elbow` | Elbow | flexion 0 to 145° | `codo` |
| `lumbar` | Lumbar spine | flexion | `lumbar` |
| `neck` | Neck | flexion | `cuello` |

Ranges not listed come from the source config. The source configs are the
region definitions from the Spanish atlas
(maikleonhg/atlas, CC BY-SA 4.0), which name the bones, the muscles that cross
each joint, the pivot rule and the roles of each muscle in the movement.

System scenes, each a curated allowlist of major structures:

| id | Title | Built from Z-Anatomy collections |
|---|---|---|
| `muscles` | Muscular system | Muscular system |
| `skeleton` | Skeletal system | Skeletal system |
| `heart` | Heart and circulation | Cardiovascular system: heart, great vessels, named arteries and veins of the limbs |
| `breathing` | Breathing | Visceral: lungs, trachea, bronchi. Muscular: diaphragm, intercostals, scalenes |
| `nerves` | Brain and nerves | Nervous system: brain, spinal cord, brachial plexus, lumbosacral plexus, major limb nerves |

Allowlists are authored files (section 4). The first cut of each list is the
pipeline author's; Ryan edits by name.

Entry points: `/learn` (public, no sign-in) and `/client/learn` (client shell,
fifth tab labelled Learn). Both render the same components and the same data.
The public pages carry SEO metadata and a call to action; the client pages
do not.

Out of v1: linking exercises in a workout to muscles, quizzes, per-structure
SEO pages, a coach UI for editing notes, left-side mirroring, ankle and wrist
scenes, the female model, cross sections.

## 2. Pipeline: `tools/anatomy/`

Everything under `tools/anatomy/` except `.work/`, which is gitignored and
holds the downloaded source and intermediate exports.

```
tools/anatomy/
  README.md            how to run, what each step produces, licences
  source.lock.json     Z-Anatomy repo, commit, zip sha256, Blender version
  fetch.sh             downloads the pinned zip into .work/, verifies sha256,
                       extracts Startup.blend only
  regions/
    configs.py         region definitions (from the Spanish atlas, CC BY-SA
                       header kept), one entry per joint scene
  build_region.py      Blender script: rig + weights + morphs → .work/<id>.glb
                       and .work/<id>.meta.json (adapted from the atlas, CC BY-SA)
  build_system.py      Blender script: allowlist → .work/<id>.glb
  extract_text.py      Blender script: definitions for every structure →
                       .work/definitions.json
  compress.sh          gltf-transform: simplify where asked, meshopt, rename to
                       content hash, copy to public/anatomy/
  merge.ts             generated + authored → data/anatomy/*.json
  verify.ts            budgets, references, licences; non-zero exit on failure
```

Pinned inputs. Z-Anatomy repository `Z-Anatomy/Models-of-human-anatomy`,
commit `7b8d2e3333d2`, `Z-Anatomy.zip` sha256
`e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736` (87 MB;
`Startup.blend` inside is 307 MB, saved by Blender 3.5). Blender 5.2.2 LTS at
`/Applications/Blender.app` (installed with `brew install --cask blender`).
glTF Transform CLI 4.5.0 via `npx`. Blender runs headless:
`blender -b --python build_region.py -- knee`. Blender refuses the Python
embedded in the source file by default; nothing enables it.

Region build. Unchanged in method from the atlas script: a two-bone armature
(`proximal`, `distal`) at the joint, bones and muscles weighted to one side or
blended across the joint, a `contraccion` morph on the flexors, insertion
areas (`.or`/`.er` objects) exported as hidden meshes, materials stripped.
The meta file records pivot, axis, up and sign in glTF (Y-up) coordinates.

System build. Allowlists live in `data/anatomy/authored/systems/` (section 4).
For each allowlist: collect the named objects (meshes and
curves), drop label objects (`.j`, `.t`) and group empties (`.g`), set curve
`resolution_u` to 4 and `bevel_resolution` to 2 so vessels and nerves export
as light tubes, cap subdivision at 0, decimate meshes over 400 faces to the
ratio in the allowlist (default 0.25), export with modifiers applied and
materials stripped. Bilateral structures are exported for both sides.

Compression. `gltf-transform simplify` only where an allowlist asks for it,
then `gltf-transform meshopt`. Output name `<sceneId>.<sha256 first 8>.glb`.
`public/anatomy/` holds only current files; stale hashes are deleted by the
build.

Names. Node names in every GLB are the Z-Anatomy object names, unchanged
(`Rectus femoris muscle.r`). Three.js rewrites node names on load; the viewer
reads the original from `object.userData.name`.

Verify. Fails the build when: a GLB is over budget (joint scene 1.2 MB, system
scene 3 MB); a structure referenced in authored content has
no node in its scene; a scene lists a file that does not exist; an allowlist
names an object missing from the source. Prints triangle counts per file.

Commands in `package.json`: `anatomy:fetch`, `anatomy:build` (regions,
systems, text, compress, merge, verify), `anatomy:verify`. None of them run in
`next build`; assets and JSON are committed.

## 3. Assets and caching

GLBs are committed to `public/anatomy/`. Expected v1 total under 20 MB. If
the folder passes 50 MB, move to a Supabase public bucket with the same file
names; nothing else changes. `next.config.js` gains a header rule for
`/anatomy/:path*`: `Cache-Control: public, max-age=31536000, immutable`.
`public/anatomy/LICENSE.md` carries the attributions (section 9).

## 4. Content model: `data/anatomy/`

```
data/anatomy/
  generated/           written by merge.ts from pipeline output; do not edit
    structures.json
    scenes.json
  authored/            Ryan's; never written by the pipeline
    coach-notes.json
    roles.json
    scenes.json
    systems/<id>.allowlist.json   structure names and decimation ratios
  learn.json           merged; the only file the app reads
```

`authored/scenes.json` holds, per scene, the title, blurb, the layers of a
system scene, and the movement's label and coach note. Everything geometric in
a scene comes from the pipeline.

Structure id: the Z-Anatomy object name without the side suffix, slugified
(`Rectus femoris muscle.r` → `rectus-femoris-muscle`). Side is data, not
identity.

```ts
type Structure = {
  id: string
  label: string                 // "Rectus femoris"
  system: "muscles" | "skeleton" | "heart" | "breathing" | "nerves"
  kind: "muscle" | "bone" | "vessel" | "nerve" | "organ" | "other"
  definition?: { text: string; source: "Z-Anatomy"; license: "CC-BY-SA-4.0" }
  coachNote?: string            // Ryan's, plain text, no long dashes
  nodes: Record<string, string[]>  // sceneId -> glTF node names (both sides)
}

type Scene = {
  id: string
  kind: "joint" | "system"
  title: string
  blurb: string                 // authored
  file: { path: string; bytes: number; sha256: string }
  structures: string[]          // ids present in this scene
  layers?: { id: string; label: string; structures: string[]; defaultOn: boolean }[]  // system scenes
  movement?: {                  // joint scenes
    id: string; label: string; range: [number, number]
    pivot: [number, number, number]; axis: [number, number, number]; sign: 1 | -1
    roles: Record<string, "agonist" | "antagonist" | "synergist" | "stabilizer">
    coachNote?: string
  }
}
```

Definitions come from the text blocks inside the Z-Anatomy file (3,839 texts,
covering 2,068 of 2,517 structure names). The extractor keeps the first
paragraph after the heading, strips wiki markup, and runs `noLongDashes`.
Roles for the six joint scenes start from the atlas data (its `ag/an/si/ne`
mapped to the four roles above) and are copied into `authored/roles.json` once
so Ryan can edit them.

Merge rules: authored wins over generated field by field; a coach note for an
unknown structure fails verify; `learn.json` is regenerated on every build and
committed.

## 5. The viewer

`components/learn/AnatomyViewer.tsx`, a client component, loaded with
`next/dynamic` and `ssr: false`. `three` is added as a dependency, pinned at
0.185.x, imported only here, so no other page pays for it.

Behaviour, both scene kinds:
- Loads the scene file with GLTFLoader and MeshoptDecoder; shows a loading
  shimmer until the first frame.
- Orbit, pinch zoom, two-finger pan; pointer events with `touch-action: none`.
- Tap (pointer up within 6 px of pointer down) raycasts visible meshes;
  selecting a structure brightens it and drops everything else that is not
  bone to 35% opacity. Tapping empty space clears.
- A fixed anatomical palette that reads on every theme: bone off-white,
  muscle red, arteries red, veins blue, nerves yellow, organs by kind. Only the
  selection highlight comes from the theme (`--app-accent`), so the Midnight
  theme never turns muscles blue.
- Renders only when something changed (controls, selection, slider, resize,
  playing). Pixel ratio capped at 2. Disposes geometry, materials and the
  renderer on unmount.
- Exposes `window.__wodLearn = { select(id), selected(), ready }` for tests.
- If WebGL is unavailable, renders the scene's poster image and the structure
  list still works.

Joint scenes add a movement slider (range from the scene) that rotates the
`distal` bone around the scene axis and drives the morph influence
`(angle / max) ^ 0.8`, plus Play, which sweeps the range at 1.2° per frame.
Insertion-area meshes stay hidden in v1.

System scenes add layer toggles (chips above the canvas) from `scene.layers`.

Around the viewer, `components/learn/SceneView.tsx` composes: the canvas, the
structure card (label, kind, role in the movement when on a joint scene,
definition excerpt with a "from Wikipedia via Z-Anatomy" line, coach note), and
a searchable structure list that selects on tap. On phones the card and list
are a bottom sheet; on wide screens a right column.

## 6. Pages and navigation

Public:
- `app/learn/page.tsx`: hero, the six joints as cards, the five systems as
  cards, a credits link. Metadata title "Learn anatomy · WOD.COACH".
- `app/learn/[scene]/page.tsx`: `SceneView` plus a call to action card
  ("Train with Ryan", href `LEARN_CTA_URL` in `lib/learn.ts`, set to
  `https://ryandobbeck.com`). Metadata
  per scene from `learn.json`. `generateStaticParams` from the scene ids.
- `app/learn/credits/page.tsx`: section 9 as a page.

Client:
- `app/client/learn/page.tsx` and `app/client/learn/[scene]/page.tsx`: the
  same components inside the client shell, behind `requireClient`, no call to
  action.
- `components/client/BottomNav.tsx`: a fifth tab, Learn, between History and
  Messages; grid becomes five columns; match on `/client/learn`.

`lib/learn.ts` loads `data/anatomy/learn.json` at build time and exposes
`getScenes()`, `getScene(id)`, `getStructure(id)` and `LEARN_CTA_URL`.

The middleware already passes `/learn` through on the main domain and
redirects it to the main domain from coach subdomains; no change.

## 7. Performance budgets

- Joint scene file under 1.2 MB (the lumbar scene measured 997 KB in the
  source atlas); system scene file under 3 MB; verified at build.
- Under 600k triangles on screen; the muscular system measured 572k at 2.1 MB.
- First rendered frame under two seconds on LTE from a cold cache.
- No rendering while idle; battery drain on a phone left on the page should be
  negligible.
- Fonts, three.js and the viewer chunk load only on Learn routes.

## 8. Testing

Playwright, in `tests/learn.spec.ts`, a `learn` project in the config that
launches Chromium with software WebGL (SwiftShader launch args):
- `/learn` renders both card groups and the credits link.
- `/learn/knee` reaches `window.__wodLearn.ready`, tapping "Rectus femoris" in
  the list updates the card with its label and "antagonist".
- Moving the slider changes the angle readout.
- `/client/learn` shows the Learn tab active for a signed-in client; `/learn`
  shows no bottom nav and shows the call to action.

Unit, with Node's test runner (`node --test`, no new framework):
- `merge.ts`: authored wins, unknown structure fails, slugify cases.
- `verify.ts`: budget and reference failures on a fixture.

Pipeline: `anatomy:verify` runs before any commit that changes assets. The
knee output is compared to the spike output on first build as a regression
check.

## 9. Licences and credits

- Model geometry and generated definitions: Creative Commons BY-SA 4.0,
  derived from Z-Anatomy, which derives from BodyParts3D © The Database Center
  for Life Science, CC BY 4.0. The region method and configs come from
  maikleonhg/atlas, CC BY-SA 4.0. Definitions are Wikipedia text as shipped in
  Z-Anatomy, CC BY-SA.
- Those files (`public/anatomy/*`, `data/anatomy/generated/*`, `tools/anatomy/
  build_region.py`, `tools/anatomy/regions/configs.py`) are published under
  CC BY-SA 4.0 and say so in `public/anatomy/LICENSE.md` and file headers.
- Ryan's coach notes, blurbs and the app code are not derivatives of the model
  and keep their own copyright.
- Credits appear on `/learn/credits` and as a one-line footer on every scene.
- The organ GLBs from the `rdobbeck/anatomy` fork are not used.

## 10. Risks and the answer to each

- Vessel and nerve layers are heavy: curated allowlists plus low curve
  resolution; verify enforces 3 MB.
- Blender upgrades change output: Blender version pinned in `source.lock.json`;
  the README says to rebuild and diff triangle counts before upgrading.
- Z-Anatomy renames objects upstream: the commit is pinned; a bump re-runs
  verify, which names every missing structure.
- Old phones without WebGL2: the poster fallback keeps the content readable.
- Preview deployments need a Vercel sign-in on phones: known, acceptable for
  review; production is open.
- The spike branch `spike/anatomy-3d` and `~/wodcoach-anatomy-spike/` are
  throwaway and are deleted once the pipeline lands.
