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
