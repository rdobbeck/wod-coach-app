# Region definitions derived from maikleonhg/atlas (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2),
# licensed CC BY-SA 4.0. This file stays CC BY-SA 4.0. Keys are Spanish; see tools/anatomy/README.md.
# Hombro izquierdo · abducción glenohumeral. Lo carga configs.py (REGIONS['hombro']).
# Pivote = centro de la cabeza humeral (esfera ajustada por mínimos cuadrados a la superficie articular de Humerus.l),
# eje antero-posterior (abducción en el plano frontal), "arriba" = del codo hacia la cabeza (eje del húmero).
# 'radio': sólo sigue al brazo lo que está cerca del eje del húmero (pectoral, dorsal ancho, redondo mayor... se estiran
# desde el tórax/escápula en vez de girar enteros). 'bulto':'pca' abulta cada músculo según su eje largo (supraespinoso horizontal).
ARM_L = {'root':'Bones of free part of upper limb.g','exclude':['Humerus.l'],'name':'Bones of forearm and hand.l'}
THORAX_L = ['First rib.l','Second rib.l','Third rib.l','Fourth rib.l','Fifth rib.l','Sixth rib.l','Seventh rib.l','Eighth rib.l',
  'Costal cartilage of first rib.l','Costal cartilage of second rib.l','Costal cartilage of third rib.l','Costal cartilage of fourth rib.l',
  'Costal cartilage of fifth rib.l','Costal cartilage of sixth rib.l','Costal cartilage of seventh rib.l',
  'Manubrium of sternum','Body of sternum']
REGION = {
  'titulo':'Hombro', 'region_cuerpo':'armL', 'lado':'l',
  'fijo':  {'huesos':['Scapula.l','Clavicle.l'], 'musculos':[], 'grupos':{'Ribs and sternum.l':THORAX_L}},
  'movil': {'huesos':['Humerus.l'], 'grupo':ARM_L},
  'parcial': {},
  'articulacion': {'hueso':'Humerus.l','nombre':'hombro','distal_hacia':'lateral',
    'pivote':[0.17029,0.02648,1.38277],        # centro de la cabeza humeral (r = 2.34 cm)
    'eje':[0.0,1.0,0.0],                       # antero-posterior → abducción en el plano frontal
    'arriba':[-0.1712,-0.0309,0.9848],         # (pivote − centro del extremo distal del húmero), normalizado
    'largo':0.30, 'radio':[0.055,0.095], 'bulto':'pca'},
  'cruzan': ['Clavicular part of deltoid muscle.l','Acromial part of deltoid muscle.l','Scapular spinal part of deltoid muscle.l',
    'Supraspinatus muscle.l','Infraspinatus muscle.l','Teres minor muscle.l','Subscapularis muscle.l','Teres major muscle.l',
    'Clavicular head of pectoralis major muscle.l','Sternocostal head of pectoralis major muscle.l','(Abdominal part of pectoralis major muscle).l',
    'Latissimus dorsi muscle.l','Coracobrachialis muscle.l','Long head of biceps brachii.l','Short head of biceps brachii.l',
    'Long head of triceps brachii.l'],
  'abultan': ['Clavicular part of deltoid muscle.l','Acromial part of deltoid muscle.l','Scapular spinal part of deltoid muscle.l','Supraspinatus muscle.l'],
  'decimar': {'Scapula.l':0.2,'Ribs and sternum.l':0.15}, 'suavizar': [],
  'inserciones': {
    'Clavicular part of deltoid muscle.l':{'o':['Clavicular part of deltoid muscle.ol'],'e':['Deltoid muscle.el']},
    'Acromial part of deltoid muscle.l':{'o':['Acromial part of deltoid muscle.ol'],'e':['Deltoid muscle.el']},
    'Scapular spinal part of deltoid muscle.l':{'o':['Scapular spinal part of deltoid muscle.ol'],'e':['Deltoid muscle.el']},
    'Supraspinatus muscle.l':{'o':['Supraspinatus muscle.ol'],'e':['Supraspinatus muscle.el']},
    'Infraspinatus muscle.l':{'o':['Infraspinatus muscle.ol'],'e':['Infraspinatus muscle.el']},
    'Teres minor muscle.l':{'o':['Teres minor muscle.ol'],'e':['Teres minor muscle.el']},
    'Subscapularis muscle.l':{'o':['Subscapularis muscle.ol'],'e':['Subscapularis muscle.el']},
    'Teres major muscle.l':{'o':['Teres major muscle.ol'],'e':[]},
    'Clavicular head of pectoralis major muscle.l':{'o':['Pectoralis major muscle.ol'],'e':['Pectoralis major muscle.el']},
    # en Z-Anatomy los .el/.e1l/.e2l de la cabeza esternocostal están en esternón y cartílagos: son su ORIGEN
    'Sternocostal head of pectoralis major muscle.l':{'o':['Sternocostal head of pectoralis major muscle.el','Sternocostal head of pectoralis major muscle.e1l','Sternocostal head of pectoralis major muscle.e2l'],'e':['Pectoralis major muscle.el']},
    '(Abdominal part of pectoralis major muscle).l':{'o':['(Abdominal part of pectoralis major muscle).ol'],'e':['Pectoralis major muscle.el']},
    # .el del dorsal ancho está en el ángulo inferior de la escápula (fascículo accesorio de origen), no en el húmero
    'Latissimus dorsi muscle.l':{'o':['Latissimus dorsi muscle.ol','Latissimus dorsi muscle.el'],'e':[]},
    'Coracobrachialis muscle.l':{'o':['Coracobrachialis muscle.ol'],'e':[]},
    'Long head of biceps brachii.l':{'o':['Long head of biceps brachii.ol'],'e':['Biceps brachii muscle.el']},
    # 'Short head of biceps brachii.ol' existe pero está en la escápula DERECHA (x<0): no se usa
    'Short head of biceps brachii.l':{'o':[],'e':['Biceps brachii muscle.el']},
    'Long head of triceps brachii.l':{'o':['Long head of triceps brachii.ol'],'e':['Triceps brachii muscle.el']},
  }}
