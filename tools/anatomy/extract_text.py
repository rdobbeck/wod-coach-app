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
