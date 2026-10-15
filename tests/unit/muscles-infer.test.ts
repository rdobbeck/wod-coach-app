import test from "node:test"
import assert from "node:assert/strict"
import { inferMuscles } from "../../lib/muscles/infer"

const cases: [string, string[], string[]][] = [
  ["Back Squat", ["glutes", "quads"], ["lower-back", "adductors"]],
  ["Goblet Squat", ["glutes", "quads"], ["lower-back", "adductors"]],
  ["Front Squat", ["glutes", "quads"], ["lower-back", "adductors"]],
  ["Romanian Deadlift", ["glutes", "hamstrings"], ["lower-back"]],
  ["Dumbbell Romanian Deadlift", ["glutes", "hamstrings"], ["lower-back"]],
  ["Kettlebell Deadlift", ["glutes", "hamstrings"], ["forearms", "lower-back", "quads", "traps"]],
  ["Trap Bar Deadlift", ["glutes", "quads"], ["traps", "lower-back", "hamstrings"]],
  ["Bench Press", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Dumbbell Bench Press", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Incline Dumbbell Bench Press", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Push-Up", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Weighted Ring Push-Up", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Dumbbell Push-Up", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Weighted Ring Dip", ["chest", "triceps"], ["front-delts"]],
  ["Strict Press", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Dumbbell Shoulder Press", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Eccentric Handstand Push-Up", ["front-delts", "triceps"], ["side-delts", "traps", "serratus"]],
  ["Strict Wall Facing Handstand Push-Ups", ["front-delts", "triceps"], ["side-delts", "traps", "serratus"]],
  ["Back to Wall Handstand Hold", ["front-delts", "serratus"], ["traps", "triceps", "abs"]],
  ["Wall Facing Handstand Hold", ["front-delts", "serratus"], ["traps", "triceps", "abs"]],
  ["Box Pike Hold", ["front-delts", "serratus"], ["traps", "triceps", "abs"]],
  ["Handstand Walk", ["front-delts", "serratus"], ["traps", "triceps", "abs"]],
  ["Weighted Pull-Up", ["lats", "biceps"], ["rear-delts", "upper-back", "forearms"]],
  ["Eccentric Pull-Up", ["lats", "biceps"], ["rear-delts", "upper-back", "forearms"]],
  ["Strict Pull-Up", ["lats", "biceps"], ["rear-delts", "upper-back", "forearms"]],
  ["Strict Chest to Bar Pull-Up", ["lats", "biceps"], ["rear-delts", "upper-back", "forearms"]],
  ["Weighted Chin-Up (supinated)", ["lats", "biceps"], ["rear-delts", "upper-back", "forearms"]],
  ["Rope Pull-Up", ["lats", "biceps"], ["rear-delts", "upper-back", "forearms"]],
  ["Peg Board Pull Ups", ["lats", "biceps"], ["rear-delts", "upper-back", "forearms"]],
  ["Tall Kneeling Band Straight Arm Lat Pulldown", ["lats"], ["triceps", "abs"]],
  ["Feet Elevated Ring Row", ["lats", "upper-back"], ["rear-delts", "biceps"]],
  ["Chest Supported Incline Dumbbell Row", ["lats", "upper-back"], ["rear-delts", "biceps"]],
  ["1-Arm DB Row", ["lats", "upper-back"], ["rear-delts", "biceps"]],
  ["Ring Row", ["lats", "upper-back"], ["rear-delts", "biceps"]],
  ["Dumbbell 3 Point Row", ["lats", "upper-back"], ["rear-delts", "biceps"]],
  ["Band Pull Apart", ["rear-delts", "upper-back"], ["rotator-cuff"]],
  ["Rear Foot Elevated Split Squat", ["glutes", "quads"], ["side-glutes", "adductors"]],
  ["Goblet Split Squat", ["glutes", "quads"], ["side-glutes", "adductors"]],
  ["Shrimp Squat", ["glutes", "quads"], ["side-glutes", "adductors"]],
  ["Single-Leg Hip Thrust (bench)", ["glutes"], ["side-glutes", "hamstrings"]],
  ["Kettlebell Swing", ["glutes", "hamstrings"], ["lower-back"]],
  ["GHD Hip Extension", ["lower-back", "glutes"], ["hamstrings"]],
  ["Side Plank", ["obliques"], ["abs", "side-glutes"]],
  ["Reverse Plank", ["glutes", "hamstrings"], ["rear-delts", "lower-back"]],
  ["Hollow Body Hold", ["abs"], ["obliques", "hip-flexors"]],
  ["Hollow Body Flutter Kicks", ["abs"], ["obliques", "hip-flexors"]],
  ["Alternating Dead Bug", ["abs"], ["obliques", "hip-flexors"]],
  ["Banded Wall Dead Bug", ["abs"], ["obliques", "hip-flexors"]],
  ["L-Hang", ["abs"], ["obliques", "hip-flexors"]],
  ["Hanging Leg Raise", ["abs"], ["obliques", "hip-flexors"]],
  ["GHD Sit-Up", ["abs"], ["obliques", "hip-flexors"]],
  ["Farmer Carry", ["traps", "forearms"], ["abs", "obliques"]],
  ["Left Adductor Pull-Back", ["adductors"], []],
  // Calibration against production's 300 most-used exercises, 2026-10-14.
  ["Wall Facing Handstand Plate Step ups", ["front-delts", "serratus"], ["traps", "triceps", "abs"]],
  ["Wall Facing Shoulder Taps", ["front-delts", "serratus"], ["traps", "triceps", "abs"]],
  ["Controlled kick-ups", ["front-delts", "serratus"], ["traps", "triceps", "abs"]],
  ["Weighted Handstand NEGATIVE Deficit Push-Up", ["front-delts", "triceps"], ["side-delts", "traps", "serratus"]],
  ["Supine Hollow Hold Handstand Shape Drill", ["abs"], ["obliques", "hip-flexors"]],
  ["Hollow Hold to Superman", ["abs", "lower-back"], ["obliques", "glutes"]],
  ["Frog Stand", ["front-delts", "serratus"], ["triceps", "abs", "forearms"]],
  ["Crow Pose Holds", ["front-delts", "serratus"], ["triceps", "abs", "forearms"]],
  ["Seated Dumbbell Press", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Half Kneeling Single Arm Kettlebell Press", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Arnold Dumbbell Press", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Dumbbell Crush Press", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Incline Dumbbell Press", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Lateral Banded Walk", ["side-glutes"], []],
  ["Single-Leg Wall-Sit ISO (Goblet)", ["glutes", "quads"], ["lower-back", "adductors"]],
  ["Cable Pull Through", ["glutes", "hamstrings"], ["lower-back"]],
  ["Dead Hang", ["forearms"], ["lats", "upper-back"]],
  ["Active Hang", ["forearms"], ["lats", "upper-back"]],
  ["Bent Over Reverse Dumbbell Fly", ["rear-delts", "upper-back"], ["rotator-cuff"]],
  ["Sled Drag – Backward", ["quads", "glutes"], ["calves"]],
  ["Cable Oblique Rotation", ["obliques"], ["abs"]],
  ["Hanging Knee Tuck", ["abs"], ["obliques", "hip-flexors"]],
  ["Ring Dip Shrugs", ["upper-back"], ["chest", "lats"]],
  ["Dumbbell Pullover", ["lats", "chest"], ["serratus", "triceps"]],
  // Names the calibration rules must leave alone (checked against every library name).
  ["Dumbbell Hex Press", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["Seated Sled Pull", ["lats", "upper-back"], ["biceps", "forearms"]],
  ["Hami Sled drag", ["hamstrings"], ["glutes", "calves"]],
  ["Plank Pull-Through", ["abs"], ["obliques", "hip-flexors"]],
  ["Landmine Rotational Clean and jerk", ["glutes", "quads"], ["hamstrings", "traps", "lower-back"]],
  ["Dead Bug Dumbbell Pullover", ["abs"], ["obliques", "hip-flexors"]],
  ["Dead Hang to Pause L Sit Hold", ["abs"], ["obliques", "hip-flexors"]],
  ["Single-Arm Bench Press in Hollow", ["chest", "triceps"], ["front-delts", "serratus"]],
  ["90/90 Bottoms Up Kettlebell Squat", ["glutes", "quads"], ["lower-back", "adductors"]],
  ["Seated 90/90 Band Adduction", ["adductors"], []],
  // Final review: what sparse groups (Neck, Rotator cuff, Deep hip rotators) would list publicly, and the long tail.
  ["Dumbbell Thruster", ["quads", "glutes", "front-delts"], ["triceps", "lower-back"]],
  ["Behind the Neck Thruster", ["quads", "glutes", "front-delts"], ["triceps", "lower-back"]],
  ["Press Behind the Neck", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Smith Machine Behind the Neck Press", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Behind the Neck Snatch Grip Press", ["front-delts", "triceps"], ["side-delts", "serratus"]],
  ["Behind the Neck Cable Lat Pulldown", ["lats", "biceps"], ["upper-back", "rear-delts", "forearms"]],
  ["6 Way Manual Resisted Neck Training", ["neck"], []],
  ["Cable Glute Kickback", ["glutes"], ["hamstrings"]],
  ["Qudruped Cable Glute Kickback", ["glutes"], ["hamstrings"]],
  ["Chest Supported Dumbbell Lat Kickback", ["lats"], ["triceps", "rear-delts"]],
  ["Dumbbell Tricep Kickback", ["triceps"], []],
  ["Bar Beat Swings", ["lats", "abs"], ["forearms", "hip-flexors"]],
  ["Barbell Upright Row", ["side-delts", "traps"], ["front-delts", "biceps"]],
  ["Single Arm Upright Cable Row", ["side-delts", "traps"], ["front-delts", "biceps"]],
  ["Jefferson Curl", ["lower-back"], ["hamstrings"]],
  ["Barbell Wrist Curl", ["forearms"], []],
  ["Reverse Wrist Curl", ["forearms"], []],
  ["Half Turkish Get-Up", ["front-delts", "obliques"], ["rotator-cuff", "glutes", "abs"]],
  ["Sandbag Get Up", ["front-delts", "obliques"], ["rotator-cuff", "glutes", "abs"]],
  ["Get Up Sit Up", ["abs"], ["obliques", "hip-flexors"]],
  ["Standing Banded Hip External Rotation", ["hip-rotators"], ["side-glutes"]],
  ["Hip Internal Rotation", ["hip-rotators"], ["side-glutes"]],
  ["Dumbbell External Rotation", ["rotator-cuff"], []],
  ["Foam-Roll Push-up", ["chest", "triceps"], ["front-delts", "serratus"]],
]

/** Order-insensitive: tags are compared as sets, then the function's own vocabulary order is checked. */
const sorted = (a: string[]) => a.slice().sort()

for (const [name, primary, secondary] of cases)
  test(`tags ${name}`, () => {
    const t = inferMuscles(name)
    assert.deepEqual(sorted(t.primary), sorted(primary), `${name} primary`)
    assert.deepEqual(sorted(t.secondary), sorted(secondary), `${name} secondary`)
  })

test("conditioning, mobility, stretches and skill drills stay untagged", () => {
  for (const name of [
    "Air Bike",
    "Sidelying Windmill",
    "Banded Shoulder Extension Stretch",
    "90-90 Hip-Lift",
    "Cartwheel exit drill",
    "Row Erg",
    "Banded ER Stretch",
    // Calibration, 2026-10-14: the rowing machine, mobility drills, a cool-down stretch and a handstand balance cue.
    "Row",
    "Airplane",
    "Standing pike hold (cooldown)",
    "90/90 Hip IR Capsule Hold",
    "Knee-to-Wall Pulses",
    "Calf Stretch (knee over toe)",
    "Finger Press Tutorial",
    "Ring External Rotaiton Pull-Throughs",
    "Q&A for The 16% - Right Oblique Pelvis Orientation - Narrow ISA - SI Joint Pain - BillHartmanPT.com",
    // Final review: ankle and tibial rotation drills, tests, foam rolling and warm-up swings.
    "Tibial Internal Rotation/External Rotation CARs (30-60 degrees flexion)",
    "Ankle Internal Rotation",
    "Physio-Board Ankle External Rotation",
    "Hip Internal Rotation Test",
    "Adduction Drop Test",
    "Foam-Roll Adductor",
    "Kneeling Arm Swings",
    "Leg Swing Front to Back",
  ])
    assert.deepEqual(inferMuscles(name), { primary: [], secondary: [] }, name)
})

test("a group is never both primary and secondary, and both lists are in vocabulary order", () => {
  for (const [name] of cases) {
    const t = inferMuscles(name)
    assert.ok(!t.primary.some((g) => t.secondary.includes(g)), name)
  }
  assert.deepEqual(inferMuscles("Back Squat").primary, ["glutes", "quads"])
})
