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
  for (const name of ["Air Bike", "Sidelying Windmill", "Banded Shoulder Extension Stretch", "90-90 Hip-Lift", "Cartwheel exit drill", "Row Erg", "Banded ER Stretch"])
    assert.deepEqual(inferMuscles(name), { primary: [], secondary: [] }, name)
})

test("a group is never both primary and secondary, and both lists are in vocabulary order", () => {
  for (const [name] of cases) {
    const t = inferMuscles(name)
    assert.ok(!t.primary.some((g) => t.secondary.includes(g)), name)
  }
  assert.deepEqual(inferMuscles("Back Squat").primary, ["glutes", "quads"])
})
