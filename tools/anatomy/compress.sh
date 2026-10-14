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
  # Old hashes stay until merge and verify pass; prune.ts removes the unreferenced ones after that.
  cp "$tmp" "$OUT/$id.$h8.glb"
  bytes=$(stat -f%z "$OUT/$id.$h8.glb")
  node -e "const fs=require('fs');const f=JSON.parse(fs.readFileSync('.work/files.json','utf8'));f['$id']={kind:'$kind',path:'/anatomy/$id.$h8.glb',bytes:$bytes,sha256:'$sha'};fs.writeFileSync('.work/files.json',JSON.stringify(f,null,1))"
  echo "$id -> $id.$h8.glb ($bytes bytes)"
done
