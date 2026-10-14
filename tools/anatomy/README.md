# Anatomy pipeline

Turns the pinned Z-Anatomy snapshot into the GLB scenes and `data/anatomy/learn.json`
that the Learn pages read. Spec: `docs/superpowers/specs/2026-10-14-learn-anatomy-design.md`.

Requirements: macOS, Blender 5.2.2 LTS at `/Applications/Blender.app` (`brew install --cask blender`;
override with `BLENDER=/path/to/Blender`), Node, network for the first fetch.

    npm run anatomy:fetch    # pinned source into tools/anatomy/.work (never committed)
    npm run anatomy:build    # regions, systems, definitions, compress, merge, verify, prune
    npm run anatomy:merge    # authored edits only: no Blender, no download (about 2 s)
    npm run anatomy:verify   # budgets and references only
    npm run anatomy:posters  # card and link-preview images; needs `npm run dev` running

## Editing content

Text and roles: edit a file in `data/anatomy/authored/`, run `npm run anatomy:merge`, commit.

| File | What it holds |
|---|---|
| `scenes.json` | Each scene's title, blurb, movement label, and the layer chips of system scenes |
| `roles.json` | Per joint: the slider `range` [min, max] in degrees (0 to 180) and each muscle's role: agonist, antagonist, synergist or stabilizer |
| `coach-notes.json` | Your note per structure, keyed by its id (the name in lower case with hyphens, for example `rectus-femoris-muscle`) |
| `systems/<id>.allowlist.json` | Which Z-Anatomy structures a system scene draws |

Merge stops with a message naming the scene, structure or value when something is off (an unknown id,
a role word that is not one of the four, a range that is not two numbers smallest first, a layer that
names a structure the scene does not draw). Nothing ships until it passes.

Changing an allowlist changes geometry, so it needs the full `npm run anatomy:build` (Blender), then
`npm run anatomy:posters`. Find exact names with `blender -b --python tools/anatomy/list_names.py --
"Cardiovascular" "vein"`. A name that matches nothing stops the build before anything reaches `public/`.

The build never leaves the app half updated: new scene files are added next to the old ones, and the
old ones are only removed (`prune.ts`) after merge and verify pass. `merge.ts --collect` writes the
small build outputs merge needs to `data/anatomy/generated/inputs.json`, which is committed.

Steps and outputs:

| Step | Script | Output |
|---|---|---|
| fetch | `fetch.sh` | `.work/source/Z-Anatomy/Startup.blend`, `.work/atlas/` |
| regions | `build_region.py <id>` | `.work/regions/<id>.glb`, `<id>.meta.json`, `<id>.index.json` |
| systems | `build_system.py <id>` | `.work/systems/<id>.glb`, `<id>.index.json` |
| definitions | `extract_text.py` | `.work/definitions.json` |
| compress | `compress.sh` | `public/anatomy/<id>.<hash8>.glb`, `.work/files.json` |
| merge | `merge.ts --collect` | `data/anatomy/generated/inputs.json`, `generated/*.json`, `data/anatomy/learn.json` |
| verify | `verify.ts` | exit 1 on any budget or reference failure |
| prune | `prune.ts` | removes scene files learn.json no longer references |

Authored content lives in `data/anatomy/authored/` and is never written by the pipeline
(except `seed_roles.py`, which only writes `roles.json` when it does not exist yet).

Licences: geometry and definitions are CC BY-SA 4.0 (Z-Anatomy, from BodyParts3D CC BY 4.0;
Wikipedia text). `build_region.py` and `regions/*.py` derive from maikleonhg/atlas, CC BY-SA 4.0.
See `public/anatomy/LICENSE.md`.

Upgrading Blender or the snapshot: change `source.lock.json`, rebuild, and compare the
triangle counts `verify` prints before committing the new assets.
