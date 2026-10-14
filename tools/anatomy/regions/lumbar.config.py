# Region definitions derived from maikleonhg/atlas (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2),
# licensed CC BY-SA 4.0. This file stays CC BY-SA 4.0. Keys are Spanish; see tools/anatomy/README.md.
# Lumbar (línea media) · flexión del tronco. Simplificación didáctica: el tórax (vértebras torácicas, costillas,
# cartílagos y esternón) rota como bloque alrededor del disco L5–S1; L1–L5 y sus discos giran una fracción (peso fijo
# creciente hacia arriba) para que la columna lumbar se curve en vez de doblarse en un solo punto. Pelvis y sacro quietos.
# Coords de mundo Blender (Z arriba, anterior = -Y, derecho = x negativa).
_M = ['Rectus abdominis muscle','External abdominal oblique muscle','Internal abdominal oblique muscle',
      'Transversus abdominis muscle','Quadratus lumborum muscle','Psoas major','Iliocostalis lumborum muscle',
      'Longissimus thoracis muscle','Multifidus lumborum muscle','Latissimus dorsi muscle']
_CRUZAN = [m+s for m in _M for s in ('.r','.l')]
_INS = {   # base → (orígenes, inserciones) sin sufijo de lado; se completan con r/l. Anatómicos, no según el nombre Z-Anatomy.
  'Rectus abdominis muscle':([],['.o']),                                   # .o = cartílagos 5.º–7.º (inserción); el pubis no existe
  'External abdominal oblique muscle':(['.o','.o1','.o2','.o3'],['.o4','.o5']),   # costillas 5–8 → cresta ilíaca / lig. inguinal
  'Internal abdominal oblique muscle':(['.o3'],['.o','.o2','.o4','.o1']),  # cresta ilíaca → costillas 10–12 y cartílago 10
  'Transversus abdominis muscle':(['.o'],[]),                              # cresta ilíaca
  'Latissimus dorsi muscle':(['.o'],[]),                                   # cresta ilíaca (la inserción humeral queda fuera)
  'Iliacus muscle':(['.o'],[]),                                            # fosa ilíaca
  'Longissimus thoracis muscle':([],['.e','.e1','.e2','.e3','.e5','.e7','.e26','.e4','.e6']),  # L3–L1, T12–T10, costillas 12–10
}
_ins = {}
for _b,(_o,_e) in _INS.items():
    for _s in ('r','l'):
        _ins[_b+'.'+_s] = {'o':[_b+x+_s for x in _o], 'e':[_b+x+_s for x in _e]}
_LV = {'Vertebra L5':0.15,'Vertebra L4':0.35,'Vertebra L3':0.55,'Vertebra L2':0.75,'Vertebra L1':0.9}
_DI = {'Intervertebral disc L5-S1':0.07,'Intervertebral disc L4-L5':0.25,'Intervertebral disc L3-L4':0.45,
       'Intervertebral disc L2-L3':0.65,'Intervertebral disc L1-L2':0.83,'Intervertebral disc T12-L1':0.95}
REGION = {
  'titulo':'Columna lumbar', 'region_cuerpo':'trunk', 'lado':'m',
  'fijo':  {'huesos':['Sacrum','Coccyx','Hip bone.r','Hip bone.l'], 'musculos':['Iliacus muscle.r','Iliacus muscle.l']},
  'movil': {'huesos':['Vertebra T12'],
            'grupo':{'root':['Bones of thorax.g','Thoracic vertebrae.g','Costal cartilages.g'],'exclude':['Vertebra T12'],
                     'name':'Thorax bones'}},
  'parcial': {**_LV, **_DI},
  'articulacion': {'hueso':'Vertebra L5','nombre':'columna lumbar','distal_hacia':'anterior',
                   'pivote':[0.0,0.017,0.962],     # centro del disco L5–S1
                   'eje':[1.0,0.0,0.0],            # eje transversal (flexión/extensión en el plano sagital)
                   'arriba':[0.0,0.0,-1.0],        # hacia el segmento fijo (pelvis): el móvil está ARRIBA
                   'punta':[0.0,0.040,1.453],      # borde superior de T1
                   'largo':0.15,
                   'suave':[-0.17,0.01]},          # músculos: peso 1 a ≥17 cm sobre L5–S1 (≈T12), 0 bajo el pivote
  'cruzan': _CRUZAN,
  'abultan': ['Rectus abdominis muscle.r','Rectus abdominis muscle.l'],
  'decimar': {'Sacrum':0.35,'Coccyx':0.6,'Hip bone.r':0.6,'Hip bone.l':0.6,'Thorax bones':0.15,'Vertebra T12':0.6,
              **{k:0.5 for k in _LV}, **{k:0.35 for k in _DI}},
  'suavizar': [],
  'inserciones': _ins,
}
