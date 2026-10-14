# Joint-scene builder, derived from maikleonhg/atlas build_region.py
# (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2), CC BY-SA 4.0. This file stays CC BY-SA 4.0.
# Usage (from tools/anatomy): $BLENDER -b --python build_region.py -- <scene id>
# Reads  .work/source/Z-Anatomy/Startup.blend and regions/configs.py
# Writes .work/regions/<id>.glb, <id>.meta.json, <id>.index.json
import bpy, bmesh, json, math, re, sys, os
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, 'regions'); from configs import REGIONS
RID = sys.argv[-1]; R = REGIONS[RID]
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, '.work/source/Z-Anatomy/Startup.blend'))
D=bpy.data
# lado: 'r' (derecho) o 'l' (izquierdo). Por defecto se deduce del sufijo del hueso de la articulación.
SIDE=R.get('lado') or ('l' if R['articulacion']['hueso'].endswith('.l') else 'r')
def wverts(o): M=o.matrix_world; return [M@v.co for v in o.data.vertices]
def group_members(g):
    out=[]
    for o in D.objects:
        if o.type!='MESH' or (SIDE!='m' and not o.name.endswith('.'+SIDE)) or len(o.data.vertices)<=10 or o.name in g['exclude']: continue
        if SIDE=='m' and re.search(r'\.[a-z0-9]+$',o.name) and not o.name.endswith(('.r','.l')): continue   # línea media: sin sufijo o .r/.l (nunca .j/.g/.t/.or/.e1l…)
        p=o.parent
        while p:
            if p.name==g['root'] or (isinstance(g['root'],list) and p.name in g['root']): out.append(o.name); break   # root: objeto .g o lista de ellos
            p=p.parent
    return out
# articulación: centro de cóndilos, eje entre epicóndilos, "arriba" hacia la cabeza del hueso
hv=wverts(D.objects[R['articulacion']['hueso']])
zmin=min(v.z for v in hv); zmax=max(v.z for v in hv)
low=[v for v in hv if v.z<zmin+0.02]; P=sum(low,Vector())/len(low)
epi=[v for v in hv if v.z<zmin+0.05]
med=max(epi,key=lambda v:v.x); lat=min(epi,key=lambda v:v.x)   # lado derecho: medial = x mayor
if SIDE=='l': med,lat=lat,med                                     # lado izquierdo: medial = x menor
axis=(lat-med).normalized()
top=[v for v in hv if v.z>zmax-0.03]; head=sum(top,Vector())/len(top); up=(head-P).normalized(); L=(head-P).length
# signo: el extremo distal debe ir hacia anterior (-Y) o posterior (+Y)
mv=[w for n in R['movil']['huesos'] for w in wverts(D.objects[n])]; tip=min(mv,key=lambda v:v.z)
rot=Matrix.Rotation(0.5,3,axis)@(tip-P)
# overrides explícitos (coords de mundo Blender, Z arriba) para articulaciones que no son bisagra en z mínima:
# articulacion.pivote=[x,y,z], .eje=[x,y,z], .arriba=[x,y,z] (hacia el segmento fijo), .punta=[x,y,z] (extremo del segmento móvil)
A=R['articulacion']
if 'pivote' in A: P=Vector(A['pivote'])
if 'eje' in A: axis=Vector(A['eje']).normalized()
if 'arriba' in A: up=Vector(A['arriba']).normalized()
if 'punta' in A: tip=Vector(A['punta'])
if 'largo' in A: L=A['largo']
rot=Matrix.Rotation(0.5,3,axis)@(tip-P)
anterior=(rot.y<(tip-P).y); sign=1 if anterior==(R['articulacion']['distal_hacia']=='anterior') else -1
if A['distal_hacia'] in ('lateral','medial'):   # abducción/aducción: lateral = x+ en el lado izquierdo, x- en el derecho
    dx=(rot-(tip-P)).x*(1 if SIDE=='l' else -1); sign=1 if (dx>0)==(A['distal_hacia']=='lateral') else -1
print('pivot',P,'axis',axis,'up',up,'L',L,'sign',sign)
def smooth(a,b,x):
    t=min(1,max(0,(x-a)/(b-a))); return t*t*(3-2*t)
scene=bpy.context.scene; keep=[]; names={}
arm_data=D.armatures.new('Rig'); arm=D.objects.new('Rig',arm_data); scene.collection.objects.link(arm); keep.append(arm)
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='EDIT')
b1=arm_data.edit_bones.new('proximal'); b1.head=P; b1.tail=P+up*L
b2=arm_data.edit_bones.new('distal'); b2.head=P; b2.tail=tip; b2.parent=b1
bpy.ops.object.mode_set(mode='OBJECT')
movil_set=set(R['movil']['huesos'])|set(group_members(R['movil']['grupo']))
def bone_weight(parent_name):
    if parent_name in R['parcial']: return R['parcial'][parent_name]
    return 1.0 if parent_name in movil_set else 0.0
if A.get('pesos')=='proximidad':
    from mathutils.bvhtree import BVHTree
    def _bvh(n):
        o=D.objects[n]; M=o.matrix_world; return BVHTree.FromPolygons([M@v.co for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons])
    PROX=([_bvh(n) for n in R['fijo']['huesos']],[_bvh(n) for n in list(R['movil']['huesos'])+list(R['parcial'])])
def make(name,srcs,kind,ratio=None,subsurf=0,inflate=0.0,fixed_w=None):
    bm=bmesh.new()
    for sn in srcs:
        o=D.objects[sn]; tmp=o.data.copy(); tmp.transform(o.matrix_world); bm.from_mesh(tmp); D.meshes.remove(tmp)
    if inflate:
        bm.normal_update()
        for v in bm.verts: v.co+=v.normal*inflate
    me=D.meshes.new(name); bm.to_mesh(me); bm.free()
    ob=D.objects.new(name+'__tmp',me); scene.collection.objects.link(ob)
    if ratio or subsurf:
        if ratio: m=ob.modifiers.new('d','DECIMATE'); m.ratio=ratio
        if subsurf: m=ob.modifiers.new('s','SUBSURF'); m.levels=subsurf
        dg=bpy.context.evaluated_depsgraph_get(); nm=D.meshes.new_from_object(ob.evaluated_get(dg)); old=ob.data; ob.data=nm; ob.modifiers.clear(); D.meshes.remove(old)
    me=ob.data; me.polygons.foreach_set('use_smooth',[True]*len(me.polygons))
    gA=ob.vertex_groups.new(name='proximal'); gF=ob.vertex_groups.new(name='distal')
    for v in me.vertices:
        if fixed_w is not None: w=fixed_w
        elif kind=='fijo': w=0.0
        elif kind=='movil': w=1.0
        else:
            w=1-smooth(*A.get('suave',(-0.052*L,0.138*L)),(v.co-P).dot(up))   # opcional suave=[a,b] (m sobre (v-P)·up): tramo de transición
            if 'radio' in A:   # opcional [r0,r1] (m): sólo se mueve lo cercano al eje del segmento móvil (hombro/cadera)
                d=v.co-P; w*=1-smooth(A['radio'][0],A['radio'][1],(d-up*d.dot(up)).length)
            if A.get('pesos')=='proximidad':   # opcional (cadera): peso por cercanía relativa a huesos fijos vs móviles
                df=min(t.find_nearest(v.co)[3] for t in PROX[0]); dm=min(t.find_nearest(v.co)[3] for t in PROX[1])
                w=smooth(*A.get('transicion',(0.35,0.65)),df/(df+dm+1e-9))
        if w<1: gA.add([v.index],1-w,'REPLACE')
        if w>0: gF.add([v.index],w,'REPLACE')
    if name in R['abultan']:
        ob.shape_key_add(name='Basis'); sk=ob.shape_key_add(name='contraccion')
        sk.value=1.0  # peso por defecto 1 en el glTF (el visor no anima morphs): así se generaron los .glb publicados
        bax=up
        if A.get('bulto')=='pca':   # opcional: abultar según el eje largo de cada músculo (no el eje "arriba")
            cs=[v.co for v in me.vertices]; mu=sum(cs,Vector())/len(cs); C=Matrix(((0,0,0),(0,0,0),(0,0,0)))
            for c in cs:
                q=c-mu; C+=Matrix(((q.x*q.x,q.x*q.y,q.x*q.z),(q.y*q.x,q.y*q.y,q.y*q.z),(q.z*q.x,q.z*q.y,q.z*q.z)))
            bax=Vector((1,1,1)).normalized()
            for _ in range(60): bax=(C@bax).normalized()   # iteración de potencia → eje principal
        ss=[(v.co-P).dot(bax) for v in me.vertices]; lo=min(ss); hi=max(ss); nb=24
        bins=[[Vector(),0] for _ in range(nb)]
        for v,s in zip(me.vertices,ss):
            i=min(nb-1,int((s-lo)/(hi-lo)*nb)); bins[i][0]+=v.co; bins[i][1]+=1
        cent=[b[0]/b[1] if b[1] else None for b in bins]
        for i in range(nb):
            if cent[i] is None and i: cent[i]=cent[i-1]
        for i in range(nb-1,-1,-1):
            if cent[i] is None: cent[i]=cent[i+1]
        for v,s in zip(me.vertices,ss):
            t=(s-lo)/(hi-lo); c=cent[min(nb-1,int(t*nb))]
            r=v.co-c; r=r-bax*r.dot(bax)
            f=math.sin(math.pi*min(1,max(0,(t-.12)/.76)))**1.5
            sk.data[v.index].co=v.co+r*0.34*f
    ob.parent=arm; mod=ob.modifiers.new('arm','ARMATURE'); mod.object=arm
    keep.append(ob); names[ob.name]=name; return ob
def cap(n,limit=3000):
    v=len(D.objects[n].data.vertices); return None if v<=limit else limit/v
for n in R['fijo']['huesos']: make(n,[n],'fijo',ratio=R['decimar'].get(n))
for n,srcs in R['fijo'].get('grupos',{}).items(): make(n,srcs,'fijo',ratio=R['decimar'].get(n))   # opcional: {nombre: [objetos]} fusionados
for n in R['movil']['huesos']: make(n,[n],'movil',ratio=R['decimar'].get(n),subsurf=1 if n in R['suavizar'] else 0)
g=R['movil']['grupo']; make(g['name'],group_members(g),'movil',ratio=R['decimar'].get(g['name']))
for n,w in R['parcial'].items(): make(n,[n],'movil',ratio=R['decimar'].get(n),fixed_w=w)
for n in R['fijo']['musculos']: make(n,[n],'fijo',ratio=cap(n))
for n in R['cruzan']: make(n,[n],'cruzan',ratio=cap(n))
att={}
done=set()
for mus,oe in R['inserciones'].items():
    att[mus]={'o':[],'e':[]}
    for kind in ('o','e'):
        for an in oe[kind]:
            if an not in D.objects: print('falta',an); continue
            if an not in done:
                src=D.objects[an]; make(an,[an],'x',inflate=0.0009,fixed_w=bone_weight(src.parent.name if src.parent else ''))
                done.add(an)
            att[mus][kind].append(an)
ks=set(keep); D.batch_remove([o for o in D.objects if o not in ks])
for ob in keep:
    if ob.name in names: nn=names[ob.name]; ob.name=nn; ob.data.name=nn
os.makedirs('.work/regions', exist_ok=True)
bpy.ops.export_scene.gltf(filepath=f'.work/regions/{RID}.glb', export_format='GLB', use_active_scene=True, export_skins=True,
    export_morph=True, export_animations=False, export_materials='NONE', export_yup=True, export_texcoords=False)
conv = lambda v: [v.x, v.z, -v.y]   # Blender Z-up -> glTF Y-up
json.dump({'id': RID, 'pivot': conv(P), 'axis': conv(axis), 'up': conv(up), 'sign': sign, 'inserciones': att},
          open(f'.work/regions/{RID}.meta.json', 'w'), ensure_ascii=False)
g = R['movil']['grupo']
bones = list(R['fijo']['huesos']) + list(R['movil']['huesos']) + [g['name']] + list(R['parcial']) + list(R['fijo'].get('grupos', {}))
muscles = list(R['fijo']['musculos']) + list(R['cruzan'])
attach = sorted({a for oe in R['inserciones'].values() for k in ('o', 'e') for a in oe[k]})
json.dump({'id': RID, 'bones': bones, 'muscles': muscles, 'attach': attach}, open(f'.work/regions/{RID}.index.json', 'w'), ensure_ascii=False, indent=1)
print('verts', sum(len(o.data.vertices) for o in keep if o.type == 'MESH'), 'done')
