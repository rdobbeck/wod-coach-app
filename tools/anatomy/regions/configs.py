# Region definitions derived from maikleonhg/atlas (commit 7a21273d7bfe984541aa320de3c0438d42c5b7a2),
# licensed CC BY-SA 4.0. This file stays CC BY-SA 4.0. Keys are Spanish; see tools/anatomy/README.md.
# Configuración de regiones. Cada región: segmentos (estático / móvil), articulación y músculos.
HAND = {'root':'Bones of free part of upper limb.g','exclude':['Humerus.r','Radius.r','Ulna.r'],'name':'Hand bones.r'}
FOOT = {'root':'Bones of free part of lower limb.g','exclude':['Femur.r','Tibia.r','Fibula.r','Patella.r'],'name':'Foot bones.r'}
REGIONS = {
 'elbow': {
   'titulo':'Codo', 'region_cuerpo':'armR',
   'fijo':  {'huesos':['Humerus.r','Scapula.r','Clavicle.r'], 'musculos':['Acromial part of deltoid muscle.r','Clavicular part of deltoid muscle.r','Scapular spinal part of deltoid muscle.r','Coracobrachialis muscle.r']},
   'movil': {'huesos':['Radius.r','Ulna.r'], 'grupo':HAND},
   'parcial': {},
   'articulacion': {'hueso':'Humerus.r','nombre':'codo','distal_hacia':'anterior'},
   'cruzan': ['Long head of biceps brachii.r','Short head of biceps brachii.r','Brachialis muscle.r','Brachioradialis muscle.r',
     'Long head of triceps brachii.r','Lateral head of triceps brachii.r','Medial head of triceps brachii.r','Anconeus muscle.r',
     'Superficial head of pronator teres.r','Deep head of pronator teres.r','Supinator.r','Extensor carpi radialis longus.r',
     'Flexor carpi radialis.r','Humeral head of flexor carpi ulnaris.r','Ulnar head of flexor carpi ulnaris.r'],
   'abultan': ['Long head of biceps brachii.r','Short head of biceps brachii.r','Brachialis muscle.r','Brachioradialis muscle.r'],
   'decimar': {'Scapula.r':0.22}, 'suavizar': ['Radius.r','Ulna.r'],
   'inserciones': {
     'Long head of biceps brachii.r':{'o':['Long head of biceps brachii.or'],'e':['Biceps brachii muscle.er']},
     'Short head of biceps brachii.r':{'o':[],'e':['Biceps brachii muscle.er']},
     'Brachialis muscle.r':{'o':['Brachialis muscle.or'],'e':['Brachialis muscle.er']},
     'Brachioradialis muscle.r':{'o':['Brachioradialis muscle.or'],'e':['Brachioradialis muscle.er']},
     'Long head of triceps brachii.r':{'o':['Long head of triceps brachii.or'],'e':['Triceps brachii muscle.er']},
     'Lateral head of triceps brachii.r':{'o':['Lateral head of triceps brachii.or'],'e':['Triceps brachii muscle.er']},
     'Medial head of triceps brachii.r':{'o':['Medial head of triceps brachii.or'],'e':['Triceps brachii muscle.er']},
     'Anconeus muscle.r':{'o':['Anconeus muscle.or'],'e':['Anconeus muscle.er']},
     'Superficial head of pronator teres.r':{'o':['Pronator teres.or'],'e':['Pronator teres.er']},
     'Deep head of pronator teres.r':{'o':[],'e':['Pronator teres.er']},
     'Supinator.r':{'o':['Supinator.or'],'e':['Supinator.er']},
     'Extensor carpi radialis longus.r':{'o':['Extensor carpi radialis longus.or'],'e':['Extensor carpi radialis longus.er']},
     'Humeral head of flexor carpi ulnaris.r':{'o':[],'e':['Flexor carpi ulnaris.er']},
     'Ulnar head of flexor carpi ulnaris.r':{'o':['Ulnar head of flexor carpi ulnaris.or'],'e':['Flexor carpi ulnaris.er']},
     'Acromial part of deltoid muscle.r':{'o':['Acromial part of deltoid muscle.or'],'e':['Deltoid muscle.er']},
     'Clavicular part of deltoid muscle.r':{'o':['Clavicular part of deltoid muscle.or'],'e':['Deltoid muscle.er']},
     'Scapular spinal part of deltoid muscle.r':{'o':['Scapular spinal part of deltoid muscle.or'],'e':['Deltoid muscle.er']},
     'Coracobrachialis muscle.r':{'o':['Coracobrachialis muscle.or'],'e':[]},
   }},
 'knee': {
   'titulo':'Rodilla', 'region_cuerpo':'legR',
   'fijo':  {'huesos':['Hip bone.r','Femur.r'], 'musculos':['Tensor fasciae latae.r']},
   'movil': {'huesos':['Tibia.r','Fibula.r'], 'grupo':FOOT},
   'parcial': {'Patella.r':0.45},
   'articulacion': {'hueso':'Femur.r','nombre':'rodilla','distal_hacia':'posterior'},
   'cruzan': ['Rectus femoris muscle.r','Vastus lateralis muscle.r','Vastus medialis muscle.r','Vastus intermedius muscle.r',
     'Long head of biceps femoris.r','Short head of biceps femoris.r','Semitendinosus muscle.r','Semimembranosus muscle.r',
     'Sartorius muscle.r','Gracilis muscle.r','Lateral head of gastrocnemius.r','Medial head of gastrocnemius.r',
     'Plantaris muscle.r','Popliteus muscle.r','Soleus muscle.r','Tibialis anterior muscle.r','Fibularis longus muscle.r'],
   'abultan': ['Long head of biceps femoris.r','Short head of biceps femoris.r','Semitendinosus muscle.r','Semimembranosus muscle.r','Lateral head of gastrocnemius.r','Medial head of gastrocnemius.r'],
   'decimar': {'Hip bone.r':0.4}, 'suavizar': [],
   'inserciones': {
     'Rectus femoris muscle.r':{'o':['Rectus femoris muscle.or'],'e':['Quadriceps femoris muscle.er']},
     'Vastus lateralis muscle.r':{'o':['Vastus lateralis muscle.or'],'e':['Quadriceps femoris muscle.er']},
     'Vastus medialis muscle.r':{'o':['Vastus medialis muscle.or'],'e':['Quadriceps femoris muscle.er']},
     'Vastus intermedius muscle.r':{'o':['Vastus intermedius muscle.or'],'e':['Quadriceps femoris muscle.er']},
     'Long head of biceps femoris.r':{'o':['Long head of biceps femoris.or'],'e':['Biceps femoris muscle.er']},
     'Short head of biceps femoris.r':{'o':[],'e':['Biceps femoris muscle.er']},
     'Semitendinosus muscle.r':{'o':['Semitendinosus muscle.or'],'e':['Semitendinosus muscle.er']},
     'Semimembranosus muscle.r':{'o':['Semimembranosus muscle.or'],'e':['Semimembranosus muscle.er']},
     'Sartorius muscle.r':{'o':['Sartorius muscle.or'],'e':['Sartorius muscle.er']},
     'Gracilis muscle.r':{'o':['Gracilis muscle.or'],'e':['Gracilis muscle.er']},
     'Lateral head of gastrocnemius.r':{'o':['Lateral head of gastrocnemius.or'],'e':['Triceps surae muscle.er']},
     'Medial head of gastrocnemius.r':{'o':['Medial head of gastrocnemius.or'],'e':['Triceps surae muscle.er']},
     'Plantaris muscle.r':{'o':['Plantaris muscle.or'],'e':[]},
     'Popliteus muscle.r':{'o':['Popliteus muscle.or'],'e':['Popliteus muscle.er']},
     'Soleus muscle.r':{'o':['Soleus muscle.or'],'e':['Triceps surae muscle.er']},
     'Tibialis anterior muscle.r':{'o':['Tibialis anterior muscle.or'],'e':['Tibialis anterior muscle.er']},
     'Fibularis longus muscle.r':{'o':['Fibularis longus muscle.or'],'e':[]},
     'Tensor fasciae latae.r':{'o':['Tensor fasciae latae.or'],'e':[]},
   }},
}

# Regiones en archivos propios: regions/<id>.config.py define REGION = {...} (mismo formato que arriba).
import glob as _g, os as _o, runpy as _r
for _f in sorted(_g.glob(_o.path.join(_o.path.dirname(_o.path.abspath(__file__)),'*.config.py'))):
    REGIONS[_o.path.basename(_f)[:-len('.config.py')]]=_r.run_path(_f)['REGION']
