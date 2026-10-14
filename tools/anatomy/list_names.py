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
