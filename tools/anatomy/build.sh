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
