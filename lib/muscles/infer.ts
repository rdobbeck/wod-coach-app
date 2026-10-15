import { orderGroups, type GroupId } from "./groups"

type Rule = { re: RegExp; primary: GroupId[]; secondary?: GroupId[] }

const NONE: GroupId[] = []

/**
 * Ordered, most specific first; the first match wins. Tags are a first draft for Ryan's review
 * screen, so a rule only needs to be right for the way his library names things.
 */
const RULES: Rule[] = [
  // Not muscle training: conditioning, mobility, stretches, breathing and skill drills.
  { re: /\b(stretch(es|ing)?|mobility|foam[- ]?roll(er|ing|s)?(?![- ]?push)|smash|breath(e|ing)?|90[- ]?90|windmill|cartwheel|bike|rower|row erg|ski ?erg|running|jog|sprints?|jump rope|double[- ]?unders?)\b/i, primary: NONE },
  // "Row" on its own is the rowing machine; standing and seated pikes are stretches; Q&A videos are talks;
  // arm and leg swings are warm-ups; drop and rotation tests are assessments.
  { re: /^\s*rows?\s*$|\browing\b|\b(standing|seated) pike\b|\bq ?& ?a\b|\b(arm|leg)s? swings?\b|\b(drop|rotation) test\b/i, primary: NONE },
  // Ankle and tibial rotation drills are mobility, not the shoulder's rotator cuff.
  { re: /\b(ankle|tibial?|foot|feet)\b.*\b(internal|external)[- ]rotation|\b(internal|external)[- ]rotation\b.*\b(ankle|tibial?|foot|feet)\b/i, primary: NONE },

  // Upside down and on the hands, ahead of the leg rules: "Wall Facing Handstand Plate Step ups" is a handstand drill.
  { re: /hollow (body )?(hold )?to (superman|arch)/i, primary: ["abs", "lower-back"], secondary: ["obliques", "glutes"] },
  { re: /\bhollow (body )?(hold|rock)s?\b/i, primary: ["abs"], secondary: ["obliques", "hip-flexors"] },
  { re: /handstand\b.*\bpush[- ]?ups?|\bhspu\b|pike push[- ]?ups?/i, primary: ["front-delts", "triceps"], secondary: ["side-delts", "traps", "serratus"] },
  { re: /handstand|pike hold|wall walk|wall[- ]facing (shoulder|hip) taps|kick[- ]?ups?/i, primary: ["front-delts", "serratus"], secondary: ["traps", "triceps", "abs"] },
  { re: /frog ?stand|crow (pose|stand)/i, primary: ["front-delts", "serratus"], secondary: ["triceps", "abs", "forearms"] },

  // Hips.
  { re: /hip thrust|glute bridge|hip bridge|frog pump/i, primary: ["glutes"], secondary: ["hamstrings", "side-glutes"] },
  { re: /romanian deadlift|\brdl\b|stiff[- ]leg|good morning|single[- ]leg deadlift/i, primary: ["hamstrings", "glutes"], secondary: ["lower-back"] },
  { re: /(trap|hex) bar deadlift/i, primary: ["quads", "glutes"], secondary: ["hamstrings", "lower-back", "traps"] },
  { re: /deadlift/i, primary: ["glutes", "hamstrings"], secondary: ["quads", "lower-back", "traps", "forearms"] },
  { re: /nordic|leg curl|hamstring curl|slider curl|glute[- ]ham raise|\bghr\b/i, primary: ["hamstrings"] },
  { re: /hip extension|back extension|reverse hyper|superman/i, primary: ["glutes", "lower-back"], secondary: ["hamstrings"] },
  // Kipping beat swings on a bar are a gymnastics drill, not a hip hinge.
  { re: /\b(beat|kip(ping)?) swings?\b/i, primary: ["lats", "abs"], secondary: ["forearms", "hip-flexors"] },
  { re: /\bswings?\b/i, primary: ["glutes", "hamstrings"], secondary: ["lower-back"] },
  // A cable or band pull-through is a hinge; plank and ring pull-throughs are not.
  { re: /^(?!.*\b(plank|ring)\b).*\bpull[- ]?throughs?\b/i, primary: ["glutes", "hamstrings"], secondary: ["lower-back"] },
  { re: /copenhagen|adductor|adduction/i, primary: ["adductors"] },
  { re: /abduction|clam ?shell|monster walk|lateral band(ed)? walk|band(ed)? lateral walk|side[- ]lying leg raise|fire hydrant/i, primary: ["side-glutes"] },

  // Knees.
  { re: /\bthrusters?\b/i, primary: ["quads", "glutes", "front-delts"], secondary: ["triceps", "lower-back"] },
  { re: /split squat|lunge|step[- ]?up|shrimp squat|pistol|skater squat|cossack/i, primary: ["quads", "glutes"], secondary: ["adductors", "side-glutes"] },
  { re: /leg extension/i, primary: ["quads"] },
  { re: /squat|leg press|wall[- ]?sit/i, primary: ["quads", "glutes"], secondary: ["adductors", "lower-back"] },
  { re: /calf|heel raise|pogo/i, primary: ["calves"] },
  { re: /tibialis|tib raise|toe raise/i, primary: ["shins"] },

  // Overhead.
  { re: /(strict|push|shoulder|overhead|military|arnold|landmine|seated|standing|\bz) press|\bohp\b|press behind the neck|behind the neck (\w+ )*press/i, primary: ["front-delts", "triceps"], secondary: ["side-delts", "serratus"] },
  { re: /lateral raise|side raise/i, primary: ["side-delts"], secondary: ["traps"] },
  { re: /front raise/i, primary: ["front-delts"] },

  // Pushing.
  { re: /scap(ular)? push[- ]?ups?|serratus|wall slide/i, primary: ["serratus"], secondary: ["front-delts"] },
  { re: /bench press|floor press|push[- ]?ups?|press[- ]?ups?|chest press|crush press|hex press|(in|de)cline (\w+ )*press/i, primary: ["chest", "triceps"], secondary: ["front-delts", "serratus"] },
  { re: /(dip|support) shrugs?/i, primary: ["upper-back"], secondary: ["chest", "lats"] },
  { re: /\bdips?\b/i, primary: ["triceps", "chest"], secondary: ["front-delts"] },
  { re: /reverse\b.*\bfl(y|ies|yes)\b|bent[- ]over\b.*\bfl(y|ies|yes)\b|rear delt|pull[- ]?aparts?|face pulls?|\by[- ]raise|\bt[- ]raise|\bytw/i, primary: ["rear-delts", "upper-back"], secondary: ["rotator-cuff"] },
  { re: /\bfl(y|ies|yes)\b|pec deck/i, primary: ["chest"], secondary: ["front-delts"] },
  // Kickbacks that are not the triceps: a glute kickback and a lat kickback (straight-arm shoulder extension).
  { re: /glute kickback|band resisted kickback|donkey kick/i, primary: ["glutes"], secondary: ["hamstrings"] },
  { re: /lat kickback/i, primary: ["lats"], secondary: ["triceps", "rear-delts"] },
  { re: /triceps?|skull ?crusher|push[- ]?downs?|french press|kickbacks?/i, primary: ["triceps"] },

  // Pulling.
  { re: /\bhip\b.*\b(internal|external)[- ]rotation|\b(internal|external)[- ]rotation\b.*\bhip\b/i, primary: ["hip-rotators"], secondary: ["side-glutes"] },
  { re: /external rotation|internal rotation|\bcuban\b/i, primary: ["rotator-cuff"] },
  { re: /straight[- ]arm/i, primary: ["lats"], secondary: ["triceps", "abs"] },
  { re: /scap(ular)? pull[- ]?ups?/i, primary: ["upper-back", "lats"] },
  { re: /pull[- ]?ups?|chin[- ]?ups?|chest to bar|muscle[- ]?ups?|pull[- ]?downs?|rope climb|peg ?board/i, primary: ["lats", "biceps"], secondary: ["upper-back", "rear-delts", "forearms"] },
  { re: /upright (\w+ )?rows?/i, primary: ["side-delts", "traps"], secondary: ["front-delts", "biceps"] },
  { re: /\brows?\b/i, primary: ["upper-back", "lats"], secondary: ["rear-delts", "biceps"] },
  { re: /jefferson curls?/i, primary: ["lower-back"], secondary: ["hamstrings"] },
  { re: /wrist (curls?|extensions?|flexion|roller)/i, primary: ["forearms"] },
  { re: /curls?\b/i, primary: ["biceps"], secondary: ["forearms"] },
  { re: /shrugs?/i, primary: ["traps"] },

  // Trunk.
  { re: /suitcase/i, primary: ["obliques", "forearms"], secondary: ["abs"] },
  { re: /side plank/i, primary: ["obliques"], secondary: ["abs", "side-glutes"] },
  { re: /pallof|anti[- ]rotation|wood ?chop|russian twist|oblique|(cable|landmine) rotations?\b/i, primary: ["obliques"], secondary: ["abs"] },
  { re: /reverse plank/i, primary: ["glutes", "hamstrings"], secondary: ["lower-back", "rear-delts"] },
  { re: /plank|dead ?bug|hollow|ab wheel|roll[- ]?out|leg raise|knee raise|knee tucks?|toes[- ]to[- ]bar|\bt2b\b|\bl[- ]?(sit|hang)\b|\bv[- ]?ups?\b|sit[- ]?ups?|crunch|bird[- ]?dog|bear crawl|flutter/i, primary: ["abs"], secondary: ["obliques", "hip-flexors"] },

  // Whole body, and pulls that only show once the trunk rules have had their turn ("Dead Bug Dumbbell Pullover").
  { re: /pull[- ]?overs?/i, primary: ["lats", "chest"], secondary: ["serratus", "triceps"] },
  { re: /\b(dead|active|passive|single[- ]arm|one[- ]arm) hangs?\b/i, primary: ["forearms"], secondary: ["lats", "upper-back"] },
  // Turkish get-ups; a "Get Up Sit Up" is a sit-up and was tagged above.
  { re: /\bturkish\b|\bget[- ]?ups?\b(?!.*\bsit)/i, primary: ["front-delts", "obliques"], secondary: ["rotator-cuff", "glutes", "abs"] },
  { re: /carry|farmer|yoke/i, primary: ["forearms", "traps"], secondary: ["abs", "obliques"] },
  { re: /\bclean\b|snatch|\bjerk\b/i, primary: ["glutes", "quads"], secondary: ["hamstrings", "traps", "lower-back"] },
  { re: /seated sled pull|sled row/i, primary: ["lats", "upper-back"], secondary: ["biceps", "forearms"] },
  { re: /\bham(i|string)s? sled\b/i, primary: ["hamstrings"], secondary: ["glutes", "calves"] },
  { re: /sled (push|drag|pull)|prowler|reverse drag/i, primary: ["quads", "glutes"], secondary: ["calves"] },
  { re: /box jump|broad jump|depth jump|tuck jump|\bbounds?\b|plyo/i, primary: ["quads", "glutes"], secondary: ["calves"] },
  { re: /hip flexor|psoas|knee drive|\bmarch(es|ing)?\b/i, primary: ["hip-flexors"] },
  // "Press Behind the Neck" is a shoulder press, placed above.
  { re: /^(?!.*behind the neck).*\b(neck|cervical)\b/i, primary: ["neck"] },
  // A press no rule above placed, named with a load or a stance: overhead ("Seated Dumbbell Press").
  { re: /\b(dumbbell|db|kettlebell|kb|barbell|landmine|arnold|overhead|seated|half[- ]kneeling|tall[- ]kneeling)\b.*\bpress\b/i, primary: ["front-delts", "triceps"], secondary: ["side-delts", "serratus"] },
]

export function inferMuscles(name: string): { primary: GroupId[]; secondary: GroupId[] } {
  const rule = RULES.find((r) => r.re.test(name))
  if (!rule || rule.primary.length === 0) return { primary: [], secondary: [] }
  const primary = orderGroups(rule.primary)
  return { primary, secondary: orderGroups(rule.secondary ?? []).filter((g) => !primary.includes(g)) }
}
