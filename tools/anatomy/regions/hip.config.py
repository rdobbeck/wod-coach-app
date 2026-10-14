# Region definitions derived from maikleonhg/atlas (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2),
# licensed CC BY-SA 4.0. This file stays CC BY-SA 4.0. Keys are Spanish; see tools/anatomy/README.md.
# Cadera izquierda · flexión. La bisagra no está en la z mínima del coxal (sería el isquion): pivote = centro de la
# cabeza femoral (esfera ajustada por mínimos cuadrados a Femur.l, r≈2,4 cm; coincide con el labrum acetabular),
# eje medio-lateral puro. Los músculos que cruzan se pesan por cercanía a coxal/sacro vs fémur (pesos='proximidad').
FOOT_L = {'root':'Bones of free part of lower limb.g','exclude':['Femur.l','Tibia.l','Fibula.l','Patella.l'],'name':'Foot bones.l'}
_I = lambda o, e: {'o': o, 'e': e}
REGION = {
  'titulo':'Cadera', 'region_cuerpo':'legL', 'lado':'l',
  'fijo':  {'huesos':['Hip bone.l','Sacrum','Coccyx','Vertebra L5','Vertebra L4'], 'musculos':[]},
  'movil': {'huesos':['Femur.l','Patella.l','Tibia.l','Fibula.l'], 'grupo':FOOT_L},
  'parcial': {},
  'articulacion': {'hueso':'Hip bone.l','nombre':'cadera','distal_hacia':'anterior',
    'pivote':[0.0838,0.0049,0.8606], 'eje':[1,0,0], 'arriba':[0,0,1], 'largo':0.4,
    'pesos':'proximidad', 'transicion':(0.35,0.65)},
  'cruzan': ['Psoas major.l','Iliacus muscle.l','Rectus femoris muscle.l','Sartorius muscle.l','Tensor fasciae latae.l',
    'Pectineus muscle.l','Adductor longus.l','Adductor brevis.l','Adductor magnus.l','Gracilis muscle.l',
    'Gluteus maximus muscle.l','Gluteus medius muscle.l','Gluteus minimus muscle.l',
    'Long head of biceps femoris.l','Semitendinosus muscle.l','Semimembranosus muscle.l',
    'Piriformis muscle.l','Superior gemellus muscle.l','Obturator internus.l','Inferior gemellus muscle.l',
    'Quadratus femoris muscle.l','Obturator externus.l'],
  'abultan': ['Psoas major.l','Iliacus muscle.l','Rectus femoris muscle.l'],
  'decimar': {'Hip bone.l':0.4,'Sacrum':0.15,'Coccyx':0.4,'Vertebra L5':0.2,'Vertebra L4':0.2}, 'suavizar': [],
  'inserciones': {
    'Psoas major.l':_I([],['Iliopsoas muscle.el']),
    'Iliacus muscle.l':_I(['Iliacus muscle.ol'],['Iliopsoas muscle.el']),
    'Rectus femoris muscle.l':_I(['Rectus femoris muscle.ol'],['Quadriceps femoris muscle.el']),
    'Sartorius muscle.l':_I(['Sartorius muscle.ol'],['Sartorius muscle.el']),
    'Tensor fasciae latae.l':_I(['Tensor fasciae latae.ol'],[]),
    'Pectineus muscle.l':_I(['Pectineus muscle.ol'],[]),          # 'Pectineus muscle.el' está en el fémur DERECHO (mal nombrado)
    'Adductor longus.l':_I(['Adductor longus.ol'],['Adductor longus.el']),
    'Adductor magnus.l':_I(['Adductor magnus.ol'],['Adductor magnus.el']),
    'Gracilis muscle.l':_I(['Gracilis muscle.ol'],['Gracilis muscle.el']),
    'Gluteus maximus muscle.l':_I(['Gluteus maximus muscle.ol'],['Gluteus maximus muscle.el']),
    'Gluteus medius muscle.l':_I(['Gluteus medius muscle.ol'],['Gluteus medius muscle.el']),
    'Gluteus minimus muscle.l':_I(['Gluteus minimus muscle.ol'],[]),
    'Long head of biceps femoris.l':_I(['Long head of biceps femoris.ol'],['Biceps femoris muscle.el']),
    'Semitendinosus muscle.l':_I(['Semitendinosus muscle.ol'],['Semitendinosus muscle.el']),
    'Semimembranosus muscle.l':_I(['Semimembranosus muscle.ol'],['Semimembranosus muscle.el']),
    'Piriformis muscle.l':_I(['Piriformis muscle.or'],[]),       # en Z-Anatomy .ol/.or del piriforme están invertidos: .or es el izquierdo (x>0)
    'Superior gemellus muscle.l':_I(['Superior gemellus muscle.ol'],[]),
    'Obturator internus.l':_I(['Obturator internus.ol'],[]),
    'Inferior gemellus muscle.l':_I(['Inferior gemellus muscle.ol'],[]),
    'Quadratus femoris muscle.l':_I(['Quadratus femoris muscle.ol'],['Quadratus femoris muscle.el']),
    'Obturator externus.l':_I(['Obturator externus.ol'],[]),
  }}
