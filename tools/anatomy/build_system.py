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
