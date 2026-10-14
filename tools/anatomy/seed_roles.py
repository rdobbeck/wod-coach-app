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
