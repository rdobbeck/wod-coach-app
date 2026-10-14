# Region definitions derived from maikleonhg/atlas (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2),
# licensed CC BY-SA 4.0. This file stays CC BY-SA 4.0. Keys are Spanish; see tools/anatomy/README.md.
# Cuello (línea media) · flexión. Simplificación didáctica: cráneo + mandíbula + C1–C2 rotan como bloque alrededor
# del disco C7–T1; C3–C7 e hioides giran una fracción (peso fijo decreciente hacia abajo) para que la columna cervical
# se curve en vez de doblarse en un solo punto. Coords de mundo Blender (Z arriba, anterior = -Y).
_M = ['Sternocleidomastoid muscle','Scalenus anterior muscle','Scalenus medius muscle','Scalenus posterior muscle',
      'Longus colli muscle','Longus capitis muscle','Splenius capitis muscle','Splenius colli muscle','Semispinalis colli muscle',
      'Longissimus capitis muscle','Ascending part of trapezius muscle','Levator scapulae',
      'Sternohyoid muscle','Sternothyroid muscle','Thyrohyoid muscle','Omohyoid muscle']
_CRUZAN = [m+s for m in _M for s in ('.r','.l')]
_INS = {   # base → (objetos que se muestran como ORIGEN, como INSERCIÓN), sin la letra de lado (se agrega r/l).
  # Z-Anatomy etiqueta .o/.e según su convención, no siempre la anatómica: aquí se reordenan a origen/inserción clásicos.
  'Sternocleidomastoid muscle':(['.o','.o1'],['.e']),           # manubrio + clavícula → mastoides
  'Scalenus anterior muscle':(['.e','.e1','.e2'],['.o']),       # apófisis transversas C4–C6 → 1.ª costilla
  'Scalenus medius muscle':(['.e','.e1'],['.o']),               # apófisis transversas → 1.ª costilla
  'Scalenus posterior muscle':(['.e'],[]),                      # apófisis transversa (C5); la 2.ª costilla no está marcada
  'Longus capitis muscle':([],['.o']),                          # → porción basilar del occipital
  'Splenius colli muscle':([],['.e','.e1']),                    # → apófisis transversas C1–C2
  'Ascending part of trapezius muscle':(['.e'],['.o']),         # occipital → clavícula
  'Levator scapulae':(['.o','.o1','.o2','.o3'],['.e']),         # transversas C1–C4 → escápula
  'Sternohyoid muscle':(['.o'],['.e']),
  'Thyrohyoid muscle':(['.e'],['.o']),                          # cartílago tiroides → hioides
  'Omohyoid muscle':(['.o'],['.e']),
}
# En Z-Anatomy las marcas .e* de los escalenos (en las transversas) tienen el lado cruzado: '.el' está en x<0 (derecha).
_CRUZADO = lambda b,x: b.startswith('Scalenus') and x.startswith('.e')
_ins = {}
for _b,(_o,_e) in _INS.items():
    for _s in ('r','l'):
        _f = lambda x: _b+x+({'r':'l','l':'r'}[_s] if _CRUZADO(_b,x) else _s)
        _ins[_b+'.'+_s] = {'o':[_f(x) for x in _o], 'e':[_f(x) for x in _e]}
REGION = {
  'titulo':'Cuello', 'region_cuerpo':'head', 'lado':'m',
  'fijo':  {'huesos':['Vertebra T1','Vertebra T2','Manubrium of sternum','Clavicle.r','Clavicle.l','First rib.r','First rib.l'], 'musculos':[]},
  'movil': {'huesos':['Mandible','Atlas (C1)','Axis (C2)'],
            'grupo':{'root':'Cranium.g','exclude':['Sinus of frontal bone','Sinus of sphenoid bone',
                     'Anterior cells of ethmoid bone.r','Anterior cells of ethmoid bone.l','Middle cells of ethmoid bone.r',
                     'Middle cells of ethmoid bone.l','Posterior cells of ethmoid bone.r','Posterior cells of ethmoid bone.l'],
                     'name':'Cranium'}},
  'parcial': {'Vertebra C3':0.85,'Vertebra C4':0.7,'Vertebra C5':0.5,'Vertebra C6':0.3,'Vertebra C7':0.12,'Hyoid bone':0.75},
  'articulacion': {'hueso':'Vertebra C7','nombre':'cuello','distal_hacia':'anterior',
                   'pivote':[0.0,0.025,1.441],      # centro del disco C7–T1
                   'eje':[1.0,0.0,0.0],             # eje transversal (flexión/extensión en el plano sagital)
                   'arriba':[0.0,0.0,-1.0],         # hacia el segmento fijo (tórax): el móvil está ARRIBA
                   'punta':[0.0,0.012,1.705],       # vértice del cráneo
                   'largo':0.10,
                   'suave':[-0.10,0.01]},           # músculos: fijos bajo el pivote, 100 % móviles ≥10 cm arriba (≈C2)
  'cruzan': _CRUZAN,
  'abultan': ['Sternocleidomastoid muscle.r','Sternocleidomastoid muscle.l'],
  'decimar': {'Cranium':0.16,'Mandible':0.22,'Manubrium of sternum':0.5,'First rib.r':0.5,'First rib.l':0.5},
  'suavizar': [],
  'inserciones': _ins,
}
