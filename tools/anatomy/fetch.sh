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
