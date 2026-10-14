# Learn: Train it and Muscles worked Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every library exercise with the muscles it trains, let Ryan review the tags, show "Train it" exercises with videos on every Learn muscle, and give each exercise in a client's session muscle chips that open the 3D muscles scene with those muscles lit.

**Architecture:** Three new columns on `ExerciseLibrary` hold training-group ids from a fixed vocabulary in `lib/muscles/groups.ts`, whose Learn-structure crosswalk lives in an authored JSON file. Pure modules (`infer`, `rank`, `validate`, `review`, `resolve`, `batch`) carry all the logic and are unit tested; thin routes and components use them. Rollout follows the project's `scripts/add-*.ts` column pattern, preview first, production only with Ryan's go-ahead.

**Tech Stack:** Next.js 14 app router, React 18, Prisma 5 on Postgres (Supabase), Tailwind 3, three.js viewer from the Learn branch, Node test runner via `tsx --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-learn-train-it-design.md`

## Global Constraints

- Branch `feat/learn-train-it` (already created from `feat/learn-anatomy` and pushed). PR base `feat/learn-anatomy`.
- Columns, exactly: `primary_muscles TEXT[] NOT NULL DEFAULT '{}'`, `secondary_muscles TEXT[] NOT NULL DEFAULT '{}'`, `muscles_reviewed_at TIMESTAMP(3)` (nullable). Prisma fields `primaryMuscles`, `secondaryMuscles`, `musclesReviewedAt` with `@map`.
- A group id is never in both lists. Values outside the vocabulary are rejected on write.
- `scripts/add-exercise-muscles.ts` runs on `preview` before any push that reads the columns (the deploy guard fails the Vercel build otherwise). It runs on `public` only after Ryan says yes in chat.
- Reviewed rows (`muscles_reviewed_at` not null) are never overwritten by the script.
- Owner gate for the review screen and its API: `canUseLibraryAi(email)` from `lib/library/access.ts` (owners plus `LIBRARY_AI_COACH_EMAILS`, which includes the Playwright coach).
- Train it API cache header, exactly: `public, s-maxage=600, stale-while-revalidate=86400`.
- No em or en dashes in anything clients see.
- TypeScript target is es5: never spread a `Set` or `Map` (`[...set]`); use `Array.from`.
- Commit as the repo-local identity (`rdobbeck`). Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY`.
- Unit tests: `npm run test:unit`. Browser tests: `npx playwright test --project=setup --project=learn` (the dev server on 3011 is reused if running; reach it from Chrome as `127.0.0.1:3011`).

## Review Focus

1. A workout row whose name differs from the library only by case ("pull-up" vs "Pull-Up") and has no library link still gets chips. Pinned in Task 8's `resolveMuscles` tests.
2. A Learn URL with junk or duplicated group ids (`?highlight=glutes,glutes,foo&also=glutes`) lights only valid groups once, and a group never shows as both primary and secondary. Pinned in Task 7's `parseWorked` tests.
3. The Train it request failing (offline, 500) shows a one-line message and leaves the card working, never an endless skeleton. Pinned in Task 6's e2e with an aborted route.
4. Two library rows with the same name ("Back Squat" twice) appear once in Train it, and a review saves both. Pinned in Task 4's `rankForGroup` test and Task 5's PATCH e2e that checks both rows.
5. A muscle group with no tagged exercises hides the Train it section instead of showing an empty box. Pinned in Task 6's e2e that routes an empty answer.

---

## File structure

New pure logic (unit tested): `lib/muscles/groups.ts` (vocabulary, crosswalk lookups, URL parsing and building), `lib/muscles/infer.ts` (name rules), `lib/muscles/batch.ts` (group rows by identical tags for the rollout script), `lib/muscles/rank.ts` (Train it order), `lib/muscles/validate.ts` (PATCH body), `lib/muscles/review.ts` (review list), `lib/muscles/resolve.ts` (chips for a workout row).

New server code: `lib/muscles/usage.ts` (use counts from the database), `app/api/learn/train/route.ts`, `app/api/exercises/[id]/muscles/route.ts`, `app/coach/library/muscles/page.tsx`, `scripts/add-exercise-muscles.ts`.

New UI: `components/coach/MuscleReviewRow.tsx`, `components/learn/TrainIt.tsx`, `components/learn/MusclesWorked.tsx`.

New data: `data/anatomy/authored/muscle-groups.json`.

Modified: `prisma/schema.prisma`, `app/api/exercises/route.ts`, `app/api/library/ai/save/route.ts`, `app/coach/library/page.tsx`, `lib/learn-viewer.ts`, `components/learn/AnatomyViewer.tsx`, `components/learn/SceneView.tsx`, `components/client/WorkoutPlayer.tsx`, `app/client/workouts/[id]/page.tsx`, `playwright.config.ts`, `tests/unit/learn-viewer.test.ts`.

Tests: `tests/unit/muscles-groups.test.ts`, `muscles-infer.test.ts`, `muscles-batch.test.ts`, `muscles-rank.test.ts`, `muscles-validate.test.ts`, `muscles-review.test.ts`, `muscles-resolve.test.ts`, and `tests/learn-train.spec.ts`.

Ruling recorded here for the executor: the spec names `lib/muscles.ts`; this plan uses `lib/muscles/groups.ts` so the `lib/muscles/` folder and a `lib/muscles.ts` file do not share a module name.

Second ruling: the spec's `normalizeName` already exists as `exerciseKey(name)` in `lib/exercise-key.ts` (lower case, no "A1." ordering prefix, punctuation to single spaces). It is also the key `ExerciseLog.exerciseKey` stores, so every task matches names with it instead of adding a second normalizer.

---

### Task 1: Training groups and the Learn crosswalk

**Files:**
- Create: `data/anatomy/authored/muscle-groups.json`, `lib/muscles/groups.ts`, `tests/unit/muscles-groups.test.ts`

**Interfaces:**
- Produces, from `lib/muscles/groups.ts`:
  - `MUSCLE_GROUPS: readonly { id: GroupId; label: string }[]` in vocabulary order
  - `type GroupId` (union of the 25 ids)
  - `isGroupId(x: unknown): x is GroupId`
  - `groupLabel(id: GroupId): string`
  - `structuresOf(id: GroupId): string[]`
  - `groupOfStructure(structureId: string): GroupId | null`
  - `orderGroups(ids: readonly string[]): GroupId[]` (valid ids only, deduped, vocabulary order)
  - `parseGroups(raw: string | null | undefined): GroupId[]` (comma list)
  - `musclesHref(t: { primary: readonly string[]; secondary: readonly string[] }, from: string): string`
  - (Task 7 adds `parseWorked` and `highlightOf` to this file.)
- Names are matched with the existing `exerciseKey(name)` from `lib/exercise-key.ts` (see the second ruling above), not a new function here.

- [ ] **Step 1: Write the crosswalk file**

`data/anatomy/authored/muscle-groups.json` (structure ids are the Learn muscles scene's; Ryan may move structures between groups):

```json
{
  "chest": ["sternocostal-head-of-pectoralis-major-muscle", "abdominal-part-of-pectoralis-major-muscle", "clavicular-head-of-pectoralis-major-muscle", "pectoralis-minor-muscle"],
  "front-delts": ["clavicular-part-of-deltoid-muscle"],
  "side-delts": ["acromial-part-of-deltoid-muscle"],
  "rear-delts": ["scapular-spinal-part-of-deltoid-muscle"],
  "rotator-cuff": ["supraspinatus-muscle", "infraspinatus-muscle", "teres-minor-muscle", "subscapularis-muscle"],
  "lats": ["latissimus-dorsi-muscle", "teres-major-muscle"],
  "upper-back": ["rhomboid-major-muscle", "rhomboid-minor-muscle", "transverse-part-of-trapezius-muscle", "ascending-part-of-trapezius-muscle"],
  "traps": ["descending-part-of-trapezius-muscle", "levator-scapulae"],
  "serratus": ["serratus-anterior-muscle"],
  "biceps": ["long-head-of-biceps-brachii", "short-head-of-biceps-brachii", "brachialis-muscle"],
  "triceps": ["long-head-of-triceps-brachii", "lateral-head-of-triceps-brachii", "medial-head-of-triceps-brachii", "anconeus-muscle"],
  "forearms": ["brachioradialis-muscle", "flexor-carpi-radialis", "palmaris-longus-muscle", "humeral-head-of-flexor-carpi-ulnaris", "ulnar-head-of-flexor-carpi-ulnaris", "humero-ulnar-head-of-flexor-digitorum-superficialis", "radial-head-of-flexor-digitorum-superficialis", "flexor-digitorum-profundus", "flexor-pollicis-longus", "extensor-carpi-radialis-longus", "extensor-carpi-radialis-brevis", "extensor-digitorum", "humeral-head-of-extensor-carpi-ulnaris", "ulnar-head-of-extensor-carpi-ulnaris", "supinator", "superficial-head-of-pronator-teres", "deep-head-of-pronator-teres", "pronator-quadratus"],
  "abs": ["rectus-abdominis-muscle", "transversus-abdominis-muscle", "pyramidalis-muscle"],
  "obliques": ["external-abdominal-oblique-muscle", "internal-abdominal-oblique-muscle"],
  "lower-back": ["iliocostalis-lumborum-muscle", "iliocostalis-thoracis-muscle", "longissimus-thoracis-muscle", "spinalis-thoracis-muscle", "multifidus-lumborum-muscle", "multifidus-thoracis-muscle", "quadratus-lumborum-muscle"],
  "glutes": ["gluteus-maximus-muscle"],
  "side-glutes": ["gluteus-medius-muscle", "gluteus-minimus-muscle", "tensor-fasciae-latae"],
  "hip-rotators": ["piriformis-muscle", "superior-gemellus-muscle", "inferior-gemellus-muscle", "obturator-internus", "obturator-externus", "quadratus-femoris-muscle"],
  "hip-flexors": ["iliacus-muscle", "psoas-major", "sartorius-muscle"],
  "quads": ["rectus-femoris-muscle", "vastus-lateralis-muscle", "vastus-medialis-muscle", "vastus-intermedius-muscle"],
  "hamstrings": ["long-head-of-biceps-femoris", "short-head-of-biceps-femoris", "semitendinosus-muscle", "semimembranosus-muscle"],
  "adductors": ["adductor-longus", "adductor-brevis", "adductor-magnus", "adductor-minimus", "gracilis-muscle", "pectineus-muscle"],
  "calves": ["lateral-head-of-gastrocnemius", "medial-head-of-gastrocnemius", "soleus-muscle", "plantaris-muscle"],
  "shins": ["tibialis-anterior-muscle", "tibialis-posterior-muscle", "fibularis-longus-muscle", "fibularis-brevis-muscle", "fibularis-tertius-muscle", "extensor-digitorum-longus", "extensor-hallucis-longus"],
  "neck": ["sternocleidomastoid-muscle", "scalenus-anterior-muscle", "scalenus-medius-muscle", "scalenus-posterior-muscle", "splenius-capitis-muscle", "splenius-colli-muscle", "longus-colli-muscle", "longus-capitis-muscle"]
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/muscles-groups.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import learn from "../../data/anatomy/learn.json"
import crosswalk from "../../data/anatomy/authored/muscle-groups.json"
import { groupLabel, groupOfStructure, isGroupId, MUSCLE_GROUPS, musclesHref, orderGroups, parseGroups, structuresOf } from "../../lib/muscles/groups"

const muscleScene = new Set((learn as { scenes: { id: string; structures: string[] }[] }).scenes.find((s) => s.id === "muscles")!.structures)

test("every group has structures, every structure exists in the muscles scene, none is in two groups", () => {
  const seen = new Map<string, string>()
  for (const g of MUSCLE_GROUPS) {
    const ids = structuresOf(g.id)
    assert.ok(ids.length > 0, `${g.id} is empty`)
    for (const id of ids) {
      assert.ok(muscleScene.has(id), `${g.id}: ${id} is not in the muscles scene`)
      assert.equal(seen.get(id), undefined, `${id} is in ${seen.get(id)} and ${g.id}`)
      seen.set(id, g.id)
    }
  }
})

test("the crosswalk file and the vocabulary list the same groups", () => {
  assert.deepEqual(Object.keys(crosswalk).sort(), MUSCLE_GROUPS.map((g) => g.id).sort())
})

test("labels read like a gym, with no long dashes", () => {
  assert.equal(groupLabel("side-glutes"), "Side glutes")
  for (const g of MUSCLE_GROUPS) assert.ok(!/[—–]/.test(g.label), g.label)
})

test("a structure knows its group; structures outside every group have none", () => {
  assert.equal(groupOfStructure("vastus-lateralis-muscle"), "quads")
  assert.equal(groupOfStructure("gluteus-maximus-muscle"), "glutes")
  assert.equal(groupOfStructure("frontalis-muscle"), null)
  assert.equal(groupOfStructure("nope"), null)
})

test("group lists are validated, deduped and put in vocabulary order", () => {
  assert.equal(isGroupId("quads"), true)
  assert.equal(isGroupId("quadriceps"), false)
  assert.deepEqual(orderGroups(["hamstrings", "glutes", "nope", "glutes"]), ["glutes", "hamstrings"])
  assert.deepEqual(parseGroups(" hamstrings, glutes ,,foo"), ["glutes", "hamstrings"])
  assert.deepEqual(parseGroups(null), [])
})

test("the Muscles worked link carries both lists and the exercise name", () => {
  assert.equal(
    musclesHref({ primary: ["hamstrings", "glutes"], secondary: ["lower-back"] }, "Romanian Deadlift"),
    "/client/learn/muscles?highlight=glutes%2Chamstrings&also=lower-back&from=Romanian+Deadlift",
  )
  assert.equal(musclesHref({ primary: ["calves"], secondary: [] }, "Calf Raise"), "/client/learn/muscles?highlight=calves&from=Calf+Raise")
})
```

URLSearchParams encodes the comma as `%2C` and the space as `+`; `useSearchParams().get()` decodes both, so Learn reads `glutes,hamstrings`.

- [ ] **Step 3: Run to see them fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/muscles/groups`.

- [ ] **Step 4: Write the module**

`lib/muscles/groups.ts`:

```ts
import crosswalk from "../../data/anatomy/authored/muscle-groups.json"

/**
 * Training groups: how a coach talks about muscles. Each maps to the Learn structures it covers
 * (data/anatomy/authored/muscle-groups.json). Order here is the order chips and lists use.
 */
export const MUSCLE_GROUPS = [
  { id: "chest", label: "Chest" },
  { id: "front-delts", label: "Front delts" },
  { id: "side-delts", label: "Side delts" },
  { id: "rear-delts", label: "Rear delts" },
  { id: "rotator-cuff", label: "Rotator cuff" },
  { id: "lats", label: "Lats" },
  { id: "upper-back", label: "Upper back" },
  { id: "traps", label: "Traps" },
  { id: "serratus", label: "Serratus" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "forearms", label: "Forearms and grip" },
  { id: "abs", label: "Abs" },
  { id: "obliques", label: "Obliques" },
  { id: "lower-back", label: "Lower back" },
  { id: "glutes", label: "Glutes" },
  { id: "side-glutes", label: "Side glutes" },
  { id: "hip-rotators", label: "Deep hip rotators" },
  { id: "hip-flexors", label: "Hip flexors" },
  { id: "quads", label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "adductors", label: "Adductors" },
  { id: "calves", label: "Calves" },
  { id: "shins", label: "Shins and ankles" },
  { id: "neck", label: "Neck" },
] as const

export type GroupId = (typeof MUSCLE_GROUPS)[number]["id"]

const ORDER = new Map<string, number>(MUSCLE_GROUPS.map((g, i) => [g.id, i]))
const LABEL = new Map<string, string>(MUSCLE_GROUPS.map((g) => [g.id, g.label]))
const STRUCTURES = crosswalk as Record<string, string[]>
let inverse: Map<string, GroupId> | null = null

export const isGroupId = (x: unknown): x is GroupId => typeof x === "string" && ORDER.has(x)
export const groupLabel = (id: GroupId) => LABEL.get(id) ?? id
export const structuresOf = (id: GroupId): string[] => STRUCTURES[id] ?? []

export function groupOfStructure(structureId: string): GroupId | null {
  if (!inverse) {
    inverse = new Map()
    for (const g of MUSCLE_GROUPS) for (const s of structuresOf(g.id)) inverse.set(s, g.id)
  }
  return inverse.get(structureId) ?? null
}

/** Valid ids only, each once, in vocabulary order. */
export function orderGroups(ids: readonly string[]): GroupId[] {
  const keep = new Set(ids.filter(isGroupId))
  return MUSCLE_GROUPS.map((g) => g.id).filter((id) => keep.has(id))
}

export const parseGroups = (raw: string | null | undefined): GroupId[] => orderGroups((raw ?? "").split(",").map((s) => s.trim()))

export function musclesHref(t: { primary: readonly string[]; secondary: readonly string[] }, from: string) {
  const q = new URLSearchParams()
  q.set("highlight", orderGroups(t.primary).join(","))
  const also = orderGroups(t.secondary)
  if (also.length) q.set("also", also.join(","))
  q.set("from", from)
  return `/client/learn/muscles?${q.toString()}`
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: PASS, including the six new tests.

- [ ] **Step 6: Commit**

```bash
git add data/anatomy/authored/muscle-groups.json lib/muscles/groups.ts tests/unit/muscles-groups.test.ts
git commit -m "muscles: training-group vocabulary and Learn crosswalk" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 2: Name rules

**Files:**
- Create: `lib/muscles/infer.ts`, `tests/unit/muscles-infer.test.ts`

**Interfaces:**
- Consumes: `GroupId` from Task 1.
- Produces: `inferMuscles(name: string): { primary: GroupId[]; secondary: GroupId[] }` (vocabulary order, never overlapping, both empty when no rule matches).

- [ ] **Step 1: Write the failing tests**

`tests/unit/muscles-infer.test.ts` (names are the most-used exercises in production on 2026-10-14):

```ts
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/muscles/infer`.

- [ ] **Step 3: Write the rules**

`lib/muscles/infer.ts`:

```ts
import { orderGroups, type GroupId } from "./groups"

type Rule = { re: RegExp; primary: GroupId[]; secondary?: GroupId[] }

const NONE: GroupId[] = []

/**
 * Ordered, most specific first; the first match wins. Tags are a first draft for Ryan's review
 * screen, so a rule only needs to be right for the way his library names things.
 */
const RULES: Rule[] = [
  // Not muscle training: conditioning, mobility, stretches, breathing and skill drills.
  { re: /\b(stretch(es|ing)?|mobility|foam roll(er|ing)?|smash|breath(e|ing)?|90[- ]?90|windmill|cartwheel|bike|rower|row erg|ski ?erg|running|jog|sprints?|jump rope|double[- ]?unders?)\b/i, primary: NONE },

  // Hips.
  { re: /hip thrust|glute bridge|hip bridge|frog pump/i, primary: ["glutes"], secondary: ["hamstrings", "side-glutes"] },
  { re: /romanian deadlift|\brdl\b|stiff[- ]leg|good morning|single[- ]leg deadlift/i, primary: ["hamstrings", "glutes"], secondary: ["lower-back"] },
  { re: /(trap|hex) bar deadlift/i, primary: ["quads", "glutes"], secondary: ["hamstrings", "lower-back", "traps"] },
  { re: /deadlift/i, primary: ["glutes", "hamstrings"], secondary: ["quads", "lower-back", "traps", "forearms"] },
  { re: /nordic|leg curl|hamstring curl|slider curl|glute[- ]ham raise|\bghr\b/i, primary: ["hamstrings"] },
  { re: /hip extension|back extension|reverse hyper|superman/i, primary: ["glutes", "lower-back"], secondary: ["hamstrings"] },
  { re: /\bswings?\b/i, primary: ["glutes", "hamstrings"], secondary: ["lower-back"] },
  { re: /copenhagen|adductor|adduction/i, primary: ["adductors"] },
  { re: /abduction|clam ?shell|monster walk|lateral band walk|side[- ]lying leg raise|fire hydrant/i, primary: ["side-glutes"] },

  // Knees.
  { re: /split squat|lunge|step[- ]?up|shrimp squat|pistol|skater squat|cossack/i, primary: ["quads", "glutes"], secondary: ["adductors", "side-glutes"] },
  { re: /leg extension/i, primary: ["quads"] },
  { re: /squat|leg press|wall sit/i, primary: ["quads", "glutes"], secondary: ["adductors", "lower-back"] },
  { re: /calf|heel raise|pogo/i, primary: ["calves"] },
  { re: /tibialis|tib raise|toe raise/i, primary: ["shins"] },

  // Upside down and overhead.
  { re: /handstand push[- ]?ups?|\bhspu\b|pike push[- ]?ups?/i, primary: ["front-delts", "triceps"], secondary: ["side-delts", "traps", "serratus"] },
  { re: /handstand|pike hold|wall walk/i, primary: ["front-delts", "serratus"], secondary: ["traps", "triceps", "abs"] },
  { re: /(strict|push|shoulder|overhead|military|arnold|landmine|seated|standing|\bz) press|\bohp\b/i, primary: ["front-delts", "triceps"], secondary: ["side-delts", "serratus"] },
  { re: /lateral raise|side raise/i, primary: ["side-delts"], secondary: ["traps"] },
  { re: /front raise/i, primary: ["front-delts"] },

  // Pushing.
  { re: /scap(ular)? push[- ]?ups?|serratus|wall slide/i, primary: ["serratus"], secondary: ["front-delts"] },
  { re: /bench press|floor press|push[- ]?ups?|press[- ]?ups?|chest press/i, primary: ["chest", "triceps"], secondary: ["front-delts", "serratus"] },
  { re: /\bdips?\b/i, primary: ["triceps", "chest"], secondary: ["front-delts"] },
  { re: /reverse fl(y|ies)|rear delt|pull[- ]?aparts?|face pulls?|\by[- ]raise|\bt[- ]raise|\bytw/i, primary: ["rear-delts", "upper-back"], secondary: ["rotator-cuff"] },
  { re: /\bfl(y|ies|yes)\b|pec deck/i, primary: ["chest"], secondary: ["front-delts"] },
  { re: /triceps?|skull ?crusher|push[- ]?downs?|french press|kickbacks?/i, primary: ["triceps"] },

  // Pulling.
  { re: /external rotation|internal rotation|\bcuban\b/i, primary: ["rotator-cuff"] },
  { re: /straight[- ]arm/i, primary: ["lats"], secondary: ["triceps", "abs"] },
  { re: /scap(ular)? pull[- ]?ups?/i, primary: ["upper-back", "lats"] },
  { re: /pull[- ]?ups?|chin[- ]?ups?|chest to bar|muscle[- ]?ups?|pull[- ]?downs?|rope climb|peg ?board/i, primary: ["lats", "biceps"], secondary: ["upper-back", "rear-delts", "forearms"] },
  { re: /\brows?\b/i, primary: ["upper-back", "lats"], secondary: ["rear-delts", "biceps"] },
  { re: /curls?\b/i, primary: ["biceps"], secondary: ["forearms"] },
  { re: /shrugs?/i, primary: ["traps"] },

  // Trunk.
  { re: /suitcase/i, primary: ["obliques", "forearms"], secondary: ["abs"] },
  { re: /side plank/i, primary: ["obliques"], secondary: ["abs", "side-glutes"] },
  { re: /pallof|anti[- ]rotation|wood ?chop|russian twist/i, primary: ["obliques"], secondary: ["abs"] },
  { re: /reverse plank/i, primary: ["glutes", "hamstrings"], secondary: ["lower-back", "rear-delts"] },
  { re: /plank|dead ?bug|hollow|ab wheel|roll[- ]?out|leg raise|knee raise|toes[- ]to[- ]bar|\bt2b\b|\bl[- ]?(sit|hang)\b|\bv[- ]?ups?\b|sit[- ]?ups?|crunch|bird[- ]?dog|bear crawl|flutter/i, primary: ["abs"], secondary: ["obliques", "hip-flexors"] },

  // Whole body.
  { re: /carry|farmer|yoke/i, primary: ["forearms", "traps"], secondary: ["abs", "obliques"] },
  { re: /\bclean\b|snatch|\bjerk\b/i, primary: ["glutes", "quads"], secondary: ["hamstrings", "traps", "lower-back"] },
  { re: /box jump|broad jump|depth jump|tuck jump|\bbounds?\b|plyo/i, primary: ["quads", "glutes"], secondary: ["calves"] },
  { re: /hip flexor|psoas|knee drive|\bmarch(es|ing)?\b/i, primary: ["hip-flexors"] },
  { re: /\bneck\b|cervical/i, primary: ["neck"] },
]

export function inferMuscles(name: string): { primary: GroupId[]; secondary: GroupId[] } {
  const rule = RULES.find((r) => r.re.test(name))
  if (!rule || rule.primary.length === 0) return { primary: [], secondary: [] }
  const primary = orderGroups(rule.primary)
  return { primary, secondary: orderGroups(rule.secondary ?? []).filter((g) => !primary.includes(g)) }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS. If a case fails, fix the rule (usually its position in `RULES`), not the expected tags, unless the expected tags are anatomically wrong; record any expected-tag change as a ruling.

- [ ] **Step 5: Commit**

```bash
git add lib/muscles/infer.ts tests/unit/muscles-infer.test.ts
git commit -m "muscles: name rules that draft primary and secondary muscles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 3: Columns, the rollout script, and drafted muscles on new exercises

**Files:**
- Modify: `prisma/schema.prisma` (model `ExerciseLibrary`), `app/api/exercises/route.ts`, `app/api/library/ai/save/route.ts`, `playwright.config.ts`
- Create: `lib/muscles/batch.ts`, `tests/unit/muscles-batch.test.ts`, `scripts/add-exercise-muscles.ts`, `tests/learn-train.spec.ts`
- Modify during calibration (Step 8), if a rule is wrong: `lib/muscles/infer.ts`, `tests/unit/muscles-infer.test.ts`

**Interfaces:**
- Consumes: `inferMuscles(name)` (Task 2).
- Produces:
  - Prisma fields on `ExerciseLibrary`: `primaryMuscles: string[]`, `secondaryMuscles: string[]`, `musclesReviewedAt: Date | null`. The three columns exist on the `preview` schema after this task.
  - `batchByTags(rows: readonly { id: string; name: string; primary: readonly string[]; secondary: readonly string[] }[]): { primary: string[]; secondary: string[]; ids: string[] }[]` in `lib/muscles/batch.ts`.
  - `tests/learn-train.spec.ts` with `prisma`, `PREFIX = "PW Train "` (every row the file makes starts with it; the file's `afterAll` deletes library rows with it), `COACH`, `CLIENT` and `signIn(browser, who): Promise<{ ctx, page }>`. Tasks 4 to 8 add tests to this file.

- [ ] **Step 1: Write the failing batch tests**

`tests/unit/muscles-batch.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { batchByTags } from "../../lib/muscles/batch"

const row = (id: string, name: string, primary: string[] = [], secondary: string[] = []) => ({ id, name, primary, secondary })

test("rows whose drafted tags match share one update, in first-seen order", () => {
  assert.deepEqual(batchByTags([row("a", "Back Squat"), row("b", "Hip Thrust"), row("c", "Front Squat")]), [
    { primary: ["glutes", "quads"], secondary: ["lower-back", "adductors"], ids: ["a", "c"] },
    { primary: ["glutes"], secondary: ["side-glutes", "hamstrings"], ids: ["b"] },
  ])
})

test("a row already carrying its draft is left alone", () => {
  assert.deepEqual(batchByTags([row("a", "Back Squat", ["glutes", "quads"], ["lower-back", "adductors"])]), [])
})

test("a row the rules no longer tag has its old draft cleared; an empty one stays as it is", () => {
  assert.deepEqual(batchByTags([row("a", "Air Bike", ["quads"]), row("b", "Row Erg")]), [{ primary: [], secondary: [], ids: ["a"] }])
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/muscles/batch`.

- [ ] **Step 3: Write the module**

`lib/muscles/batch.ts`:

```ts
import { inferMuscles } from "./infer"

export type DraftRow = { id: string; name: string; primary: readonly string[]; secondary: readonly string[] }
export type Batch = { primary: string[]; secondary: string[]; ids: string[] }

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * The rollout script's writes: every row gets the name rules' draft, and rows ending up with the
 * same tags share one UPDATE. Rows already carrying their draft are skipped. The caller passes
 * unreviewed rows only.
 */
export function batchByTags(rows: readonly DraftRow[]): Batch[] {
  const byTags = new Map<string, Batch>()
  for (const r of rows) {
    const t = inferMuscles(r.name)
    if (same(t.primary, r.primary) && same(t.secondary, r.secondary)) continue
    const key = `${t.primary.join(",")}|${t.secondary.join(",")}`
    const b = byTags.get(key) ?? { primary: t.primary, secondary: t.secondary, ids: [] }
    b.ids.push(r.id)
    byTags.set(key, b)
  }
  return Array.from(byTags.values())
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS, including the three new tests.

- [ ] **Step 5: Add the fields to the Prisma schema**

In `prisma/schema.prisma`, model `ExerciseLibrary`, directly after the `tracking` field:

```prisma
  // Training groups (lib/muscles/groups.ts), never one group in both lists. Drafted from the name
  // (lib/muscles/infer.ts); Ryan confirms or corrects them at /coach/library/muscles, which stamps
  // musclesReviewedAt so scripts/add-exercise-muscles.ts never redrafts them.
  primaryMuscles    String[]  @default([]) @map("primary_muscles")
  secondaryMuscles  String[]  @default([]) @map("secondary_muscles")
  musclesReviewedAt DateTime? @map("muscles_reviewed_at")
```

Run: `npx prisma generate`
Expected: "Generated Prisma Client". Do not run `prisma db push` (the columns go in through the script below) or `prisma format` (it would realign the whole model).

- [ ] **Step 6: Write the rollout script**

`scripts/add-exercise-muscles.ts`:

```ts
/**
 * Adds ExerciseLibrary.primary_muscles, secondary_muscles and muscles_reviewed_at, then drafts the
 * muscles of every unreviewed exercise from its name (lib/muscles/infer.ts). Rows Ryan reviewed are
 * never touched. Safe to re-run: after a rule change it rewrites only the drafts that changed.
 * Without --apply it only reads (it adds no column), so a dry run against production is safe.
 * Run --apply on a schema BEFORE deploying code that reads the columns (scripts/check-db-schema.ts).
 *   npx tsx scripts/add-exercise-muscles.ts preview              (what --apply would write, with a sample)
 *   npx tsx scripts/add-exercise-muscles.ts public --top=300     (the 300 most-used and their drafts)
 *   npx tsx scripts/add-exercise-muscles.ts preview --apply
 *   npx tsx scripts/add-exercise-muscles.ts public --apply       (production: only with Ryan's go-ahead)
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
import { batchByTags } from "../lib/muscles/batch"
import { inferMuscles } from "../lib/muscles/infer"

const schema = process.argv[2]
const apply = process.argv.includes("--apply")
const top = Number(process.argv.find((a) => a.startsWith("--top="))?.slice("--top=".length) ?? 0)
if (!schema || schema.startsWith("--")) throw new Error("usage: add-exercise-muscles.ts <schema> [--apply] [--top=N]")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const T = `"${schema}"."ExerciseLibrary"`

type Row = { id: string; name: string; primary: string[]; secondary: string[]; reviewed: Date | null }
const show = (t: { primary: readonly string[]; secondary: readonly string[] }) =>
  t.primary.length || t.secondary.length ? `${t.primary.join(", ") || "none"} / ${t.secondary.join(", ") || "none"}` : "(no tags)"

async function main() {
  const cols = await p.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'ExerciseLibrary' AND column_name IN ('primary_muscles', 'secondary_muscles', 'muscles_reviewed_at')`,
    schema,
  )
  let present = cols[0].n === 3
  if (apply && !present) {
    await p.$executeRawUnsafe(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS "primary_muscles" TEXT[] NOT NULL DEFAULT '{}'`)
    await p.$executeRawUnsafe(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS "secondary_muscles" TEXT[] NOT NULL DEFAULT '{}'`)
    await p.$executeRawUnsafe(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS "muscles_reviewed_at" TIMESTAMP(3)`)
    present = true
    console.log(`${schema}: columns added`)
  }
  const rows = await p.$queryRawUnsafe<Row[]>(
    present
      ? `SELECT id, name, primary_muscles AS "primary", secondary_muscles AS "secondary", muscles_reviewed_at AS "reviewed" FROM ${T} ORDER BY name, id`
      : `SELECT id, name, '{}'::text[] AS "primary", '{}'::text[] AS "secondary", NULL::timestamp AS "reviewed" FROM ${T} ORDER BY name, id`,
  )
  const open = rows.filter((r) => !r.reviewed)
  const batches = batchByTags(open)
  const changing = batches.reduce((n, b) => n + b.ids.length, 0)
  const tagged = open.filter((r) => inferMuscles(r.name).primary.length > 0).length
  console.log(`${schema}: ${rows.length} exercises, ${rows.length - open.length} reviewed (left alone), ${tagged} of ${open.length} unreviewed get tags from the rules`)
  console.log(`${changing} row(s) to write in ${batches.length} update(s)${apply ? "" : present ? " (dry run, pass --apply)" : " (dry run: the columns do not exist yet, pass --apply)"}`)

  if (top > 0) {
    // Calibration view: the most programmed and logged exercises with the tags they would get.
    const used = await p.$queryRawUnsafe<{ id: string; uses: number }[]>(
      `SELECT id, COUNT(*)::int AS uses FROM (
         SELECT "exerciseId" AS id FROM "${schema}"."WorkoutExercise" WHERE "exerciseId" IS NOT NULL
         UNION ALL
         SELECT "exerciseId" AS id FROM "${schema}"."ExerciseLog" WHERE "exerciseId" IS NOT NULL
       ) u GROUP BY id ORDER BY uses DESC, id LIMIT $1`,
      top,
    )
    const byId = new Map(rows.map((r) => [r.id, r]))
    used.forEach((u, i) => {
      const r = byId.get(u.id)
      if (!r) return
      const t = r.reviewed ? r : inferMuscles(r.name)
      console.log(`${String(i + 1).padStart(4)}  ${String(u.uses).padStart(5)}  ${r.name}  ->  ${show(t)}${r.reviewed ? "  [reviewed]" : ""}`)
    })
  } else {
    // A sample of what --apply writes: two names from each of the first updates.
    const byId = new Map(open.map((r) => [r.id, r]))
    batches
      .flatMap((b) => b.ids.slice(0, 2).map((id) => ({ name: byId.get(id)!.name, tags: b })))
      .slice(0, 12)
      .forEach((s) => console.log(`  ${s.name}  ->  ${show(s.tags)}`))
  }

  if (!apply) return
  let n = 0
  for (const b of batches) {
    n += await p.$executeRawUnsafe(
      `UPDATE ${T} SET primary_muscles = $1::text[], secondary_muscles = $2::text[] WHERE id = ANY($3::text[]) AND muscles_reviewed_at IS NULL`,
      b.primary,
      b.secondary,
      b.ids,
    )
  }
  console.log(`wrote ${n} row(s)`)
}

main()
  .catch((e) => {
    console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())
    process.exitCode = 1
  })
  .finally(() => p.$disconnect())
```

- [ ] **Step 7: Dry run on preview**

Run: `npx tsx scripts/add-exercise-muscles.ts preview`
Expected: two summary lines, the second ending "(dry run: the columns do not exist yet, pass --apply)", then up to 12 sample lines such as `Back Squat  ->  glutes, quads / lower-back, adductors`. Nothing is written.

- [ ] **Step 8: Calibrate the rules against production's 300 most-used exercises**

This run is read-only (no `--apply`, so the script only runs SELECTs; reading production is allowed):

Run: `npx tsx scripts/add-exercise-muscles.ts public --top=300 > .superpowers/sdd/2026-10-14-learn-train-it/top300.txt 2>&1; wc -l .superpowers/sdd/2026-10-14-learn-train-it/top300.txt`
Expected: about 302 lines: the two summary lines, then one line per exercise as `rank  uses  name  ->  primary / secondary`.

Read every line. A strength or accessory movement with no tags, or a tag a coach would call wrong, is a rule bug. For each one:
1. Add the name and its right tags to `cases` in `tests/unit/muscles-infer.test.ts` (or, for conditioning, mobility, a stretch or a skill drill the rules wrongly tag, add it to the untagged list).
2. Run `npm run test:unit` and watch that case fail.
3. Fix the rule in `lib/muscles/infer.ts`: usually its position in `RULES`, or an alternative missing from its regex.
4. Run `npm run test:unit` until green, then rerun the `--top=300` command and reread the lines you changed.

Then check that each of the first 20 lines is pinned by the test (as a tagged case or in the untagged list) and add any missing ones the same way. The spec asks for the top 20 and at least 40 most-used names in all. Note in the ledger which names changed which rules.

- [ ] **Step 9: Watch the deploy guard refuse preview, then add the columns there**

Run: `npx tsx --env-file=.env.local scripts/check-db-schema.ts --check`
Expected: FAIL (exit 1), "STOPPING THE BUILD. The "preview" database is missing columns", listing `ExerciseLibrary.primary_muscles`, `ExerciseLibrary.secondary_muscles` and `ExerciseLibrary.muscles_reviewed_at` (`.env.local` sets `DB_SCHEMA=preview`).

Run: `npx tsx scripts/add-exercise-muscles.ts preview --apply`
Expected: `preview: columns added`, the summary, then `wrote N row(s)` where N is the "row(s) to write" count.

Run: `npx tsx scripts/add-exercise-muscles.ts preview`, then the guard command again.
Expected: `0 row(s) to write in 0 update(s) (dry run, pass --apply)`, and the guard prints `[schema-check] preview: every column the code reads is present`.

This step touches the `preview` schema only. Never pass `public --apply` in this task.

- [ ] **Step 10: Restart the dev server**

The running dev server still holds the old Prisma client. Stop it (TaskStop) and start `npm run dev` again in the background; wait until `http://127.0.0.1:3011/learn` answers.

- [ ] **Step 11: Write the failing end-to-end test**

In `playwright.config.ts`, the chromium project's `testIgnore` and the learn project's `testMatch` both become `/learn(-train)?\.spec\.ts/` (the new file renders WebGL, so it runs in the learn project).

`tests/learn-train.spec.ts`:

```ts
import { test, expect, type Browser } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * Train it and Muscles worked: drafted muscles on new exercises, Ryan's review screen, Train it on
 * Learn cards, and muscle chips in a client's session. Runs against the preview database after
 * `scripts/add-exercise-muscles.ts preview --apply`. Every row it makes starts with PREFIX.
 */
test.use({ storageState: { cookies: [], origins: [] } })

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const PREFIX = "PW Train "
const COACH = { email: "playwright-coach@dev.local", password: "playwright-test-PW-1" }
const CLIENT = { email: "playwright-client@dev.local", password: "playwright-test-PW-1" }

/** A fresh signed-in browser context; close it at the end of the test. */
async function signIn(browser: Browser, who: { email: string; password: string }) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(who.email)
  await page.locator('input[name="password"]').fill(who.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(coach|client)/, { timeout: 15_000 })
  return { ctx, page }
}

test.afterAll(async () => {
  await prisma.exerciseLibrary.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.$disconnect()
})

test("new library exercises get drafted muscles from their name, unreviewed, on both create paths", async ({ browser }) => {
  const { ctx, page } = await signIn(browser, COACH)
  const added = await page.request.post("/api/exercises", { data: { name: `${PREFIX}Goblet Squat`, videoUrl: "https://youtu.be/aaaaaaaaaaa" } })
  expect(added.ok()).toBe(true)
  const squat = await prisma.exerciseLibrary.findFirstOrThrow({ where: { name: `${PREFIX}Goblet Squat` } })
  expect(squat.primaryMuscles).toEqual(["glutes", "quads"])
  expect(squat.secondaryMuscles).toEqual(["lower-back", "adductors"])
  expect(squat.musclesReviewedAt).toBeNull()

  // The AI library builder's save path (the Playwright coach is on LIBRARY_AI_COACH_EMAILS).
  const saved = await page.request.post("/api/library/ai/save", {
    data: { entries: [{ name: `${PREFIX}Hip Thrust`, videoUrl: "https://youtu.be/bbbbbbbbbbb", thumbnailUrl: null, patterns: [], equipment: [], cues: "", summary: "" }] },
  })
  expect((await saved.json()).failed).toEqual([])
  const thrust = await prisma.exerciseLibrary.findFirstOrThrow({ where: { name: `${PREFIX}Hip Thrust` } })
  expect(thrust.primaryMuscles).toEqual(["glutes"])
  expect(thrust.secondaryMuscles).toEqual(["side-glutes", "hamstrings"])
  await ctx.close()
})
```

- [ ] **Step 12: Run it to see it fail**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts`
Expected: FAIL on `squat.primaryMuscles`: received `[]` (the column default), expected `["glutes", "quads"]`.

- [ ] **Step 13: Draft muscles on both create paths**

`app/api/exercises/route.ts`: import `inferMuscles` and add the draft to the create data.

```ts
import { inferMuscles } from "@/lib/muscles/infer"
```

```ts
  const muscles = inferMuscles(name.trim())
  const exercise = await prisma.exerciseLibrary.create({
    data: {
      name: name.trim(),
      videoUrl: videoUrl?.trim() || null,
      category: "Custom",
      difficulty: "Any",
      muscleGroups: [],
      equipment: [],
      isCustom: true,
      createdBy: session.user.id,
      locked: true,
      // A draft for Ryan's review screen; clients see it until he reviews it.
      primaryMuscles: muscles.primary,
      secondaryMuscles: muscles.secondary,
    },
    select: { id: true, name: true, videoUrl: true },
  })
```

`app/api/library/ai/save/route.ts`: the same, in the `create` branch only (a video replace keeps the row's muscles).

```ts
import { inferMuscles } from "@/lib/muscles/infer"
```

```ts
      } else {
        const muscles = inferMuscles(e.name)
        const row = await prisma.exerciseLibrary.create({
          data: {
            name: e.name,
            category: "Custom",
            difficulty: "Any",
            muscleGroups: e.patterns,
            equipment: e.equipment,
            instructions: e.cues || null,
            description: e.summary || null,
            videoUrl: e.videoUrl,
            thumbnailUrl: e.thumbnailUrl,
            isCustom: true,
            createdBy: session.user.id,
            locked: true,
            primaryMuscles: muscles.primary,
            secondaryMuscles: muscles.secondary,
          },
          select: { id: true, name: true },
        })
```

- [ ] **Step 14: Run the tests**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts`
Expected: PASS (setup plus 1 test).

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add prisma/schema.prisma lib/muscles/batch.ts tests/unit/muscles-batch.test.ts scripts/add-exercise-muscles.ts app/api/exercises/route.ts app/api/library/ai/save/route.ts playwright.config.ts tests/learn-train.spec.ts lib/muscles/infer.ts tests/unit/muscles-infer.test.ts
git commit -m "muscles: columns, rollout script, and drafted muscles on new exercises" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 4: The Train it API

**Files:**
- Create: `lib/muscles/rank.ts`, `tests/unit/muscles-rank.test.ts`, `lib/muscles/usage.ts`, `app/api/learn/train/route.ts`
- Modify: `tests/learn-train.spec.ts`

**Interfaces:**
- Consumes: `GroupId`, `isGroupId`, `groupLabel` (Task 1); `exerciseKey(name)` from `lib/exercise-key.ts` (existing); the Prisma fields (Task 3); `withAlert` from `lib/alert.ts` (existing).
- Produces:
  - `type RankInput = { id: string; name: string; videoUrl: string | null; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[] }`
  - `type TrainRow = { id: string; name: string; videoUrl: string; role: "primary" | "secondary" }`
  - `rankForGroup(rows: readonly RankInput[], group: GroupId, uses: ReadonlyMap<string, number>, limit = 6): TrainRow[]` in `lib/muscles/rank.ts`
  - `usageCounts(): Promise<Map<string, number>>` in `lib/muscles/usage.ts` (library id to WorkoutExercise plus ExerciseLog rows; cached ten minutes per server instance)
  - `GET /api/learn/train?group=<id>` answering `{ group, label, exercises: TrainRow[] }`, or 404 `{ error: "Unknown muscle group" }`

- [ ] **Step 1: Write the failing ranking tests**

`tests/unit/muscles-rank.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { rankForGroup } from "../../lib/muscles/rank"

const ex = (id: string, name: string, primary: string[], secondary: string[] = [], videoUrl: string | null = `https://youtu.be/${id}`) => ({
  id,
  name,
  videoUrl,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
})

test("primary before secondary; within each, most used first, then by name", () => {
  const rows = [
    ex("rdl", "Romanian Deadlift", ["glutes", "hamstrings"], ["lower-back"]),
    ex("ht", "Hip Thrust", ["glutes"], ["hamstrings"]),
    ex("gb", "Glute Bridge", ["glutes"], ["hamstrings"]),
    ex("sq", "Back Squat", ["glutes", "quads"]),
    ex("lc", "Leg Curl", ["hamstrings"]),
  ]
  const uses = new Map([["rdl", 50], ["ht", 9], ["gb", 9], ["sq", 80], ["lc", 200]])
  assert.deepEqual(
    rankForGroup(rows, "hamstrings", uses).map((r) => [r.id, r.role]),
    [["lc", "primary"], ["rdl", "primary"], ["gb", "secondary"], ["ht", "secondary"]],
  )
})

test("rows sharing a name are one exercise: their uses add up and the most-used row stands for them", () => {
  const rows = [ex("a", "Back Squat", ["quads"]), ex("b", "back squat", ["quads"]), ex("c", "Front Squat", ["quads"])]
  const uses = new Map([["a", 3], ["b", 40], ["c", 42]])
  assert.deepEqual(rankForGroup(rows, "quads", uses).map((r) => r.id), ["b", "c"])
})

test("at most six, only exercises with a video, unused ones ordered by name", () => {
  const rows = Array.from({ length: 9 }, (_, i) => ex(`e${i}`, `Squat ${9 - i}`, ["quads"]))
  rows.push(ex("nv", "A Squat Without Video", ["quads"], [], null))
  const out = rankForGroup(rows, "quads", new Map())
  assert.deepEqual(out.map((r) => r.name), ["Squat 1", "Squat 2", "Squat 3", "Squat 4", "Squat 5", "Squat 6"])
})

test("each row carries what the player needs", () => {
  assert.deepEqual(rankForGroup([ex("x", "Calf Raise", ["calves"])], "calves", new Map()), [
    { id: "x", name: "Calf Raise", videoUrl: "https://youtu.be/x", role: "primary" },
  ])
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/muscles/rank`.

- [ ] **Step 3: Write the ranking**

`lib/muscles/rank.ts`:

```ts
import { exerciseKey } from "../exercise-key"
import type { GroupId } from "./groups"

export type RankInput = { id: string; name: string; videoUrl: string | null; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[] }
export type TrainRow = { id: string; name: string; videoUrl: string; role: "primary" | "secondary" }

/**
 * Train it's order for one group: exercises that work it as a primary muscle first, then as a
 * secondary one; within each, the most programmed and logged first, then by name. Only rows with a
 * video count. Rows sharing a name are one exercise: their uses add up, the most-used row stands in.
 */
export function rankForGroup(rows: readonly RankInput[], group: GroupId, uses: ReadonlyMap<string, number>, limit = 6): TrainRow[] {
  const byName = new Map<string, { row: TrainRow; best: number; total: number }>()
  for (const r of rows) {
    if (!r.videoUrl) continue
    const role = r.primaryMuscles.includes(group) ? "primary" : r.secondaryMuscles.includes(group) ? "secondary" : null
    if (!role) continue
    const n = uses.get(r.id) ?? 0
    const row: TrainRow = { id: r.id, name: r.name, videoUrl: r.videoUrl, role }
    const key = exerciseKey(r.name)
    const seen = byName.get(key)
    if (!seen) {
      byName.set(key, { row, best: n, total: n })
      continue
    }
    seen.total += n
    if (n > seen.best) {
      seen.row = row
      seen.best = n
    }
  }
  return Array.from(byName.values())
    .sort((a, b) => Number(a.row.role === "secondary") - Number(b.row.role === "secondary") || b.total - a.total || a.row.name.localeCompare(b.row.name))
    .slice(0, limit)
    .map((x) => x.row)
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS, including the four new tests.

- [ ] **Step 5: Write the failing API test**

Append to `tests/learn-train.spec.ts`:

```ts
test("Train it API: up to six exercises with videos for a group, cached at the edge; unknown groups are a 404", async ({ request }) => {
  const res = await request.get("/api/learn/train?group=glutes")
  expect(res.status()).toBe(200)
  expect(res.headers()["cache-control"]).toBe("public, s-maxage=600, stale-while-revalidate=86400")
  const body = await res.json()
  expect(body).toMatchObject({ group: "glutes", label: "Glutes" })
  expect(body.exercises.length).toBeGreaterThan(0)
  expect(body.exercises.length).toBeLessThanOrEqual(6)
  expect(body.exercises[0]).toMatchObject({ role: "primary", videoUrl: expect.stringMatching(/^https?:\/\//) })
  for (const query of ["?group=quadriceps", "?group=", ""]) expect((await request.get(`/api/learn/train${query}`)).status()).toBe(404)
})
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts -g "Train it API"`
Expected: FAIL, expected status 200, received 404 (no route yet).

- [ ] **Step 7: Write the use counts and the route**

`lib/muscles/usage.ts`:

```ts
import { prisma } from "@/lib/prisma"

const TTL_MS = 10 * 60 * 1000
let cache: { at: number; counts: Map<string, number> } | null = null

/**
 * How often each library exercise is used: its rows in WorkoutExercise (programmed) plus
 * ExerciseLog (logged). Train it and the review screen rank by it. Kept ten minutes per server
 * instance; the numbers move slowly and the Train it answer is cached at the edge anyway.
 */
export async function usageCounts(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.counts
  const [programmed, logged] = await Promise.all([
    prisma.workoutExercise.groupBy({ by: ["exerciseId"], where: { exerciseId: { not: null } }, _count: { _all: true } }),
    prisma.exerciseLog.groupBy({ by: ["exerciseId"], where: { exerciseId: { not: null } }, _count: { _all: true } }),
  ])
  const counts = new Map<string, number>()
  const add = (groups: { exerciseId: string | null; _count: { _all: number } }[]) => {
    for (const g of groups) if (g.exerciseId) counts.set(g.exerciseId, (counts.get(g.exerciseId) ?? 0) + g._count._all)
  }
  add(programmed)
  add(logged)
  cache = { at: Date.now(), counts }
  return counts
}
```

`app/api/learn/train/route.ts`:

```ts
import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { groupLabel, isGroupId } from "@/lib/muscles/groups"
import { rankForGroup } from "@/lib/muscles/rank"
import { usageCounts } from "@/lib/muscles/usage"
import { prisma } from "@/lib/prisma"

/**
 * Train it: up to six library exercises with demo videos for one training group, most used first.
 * Public, like the Learn pages that show it: the library is Ryan's catalogue. Cached at the edge.
 */
async function handleGET(req: Request) {
  const group = new URL(req.url).searchParams.get("group")
  if (!isGroupId(group)) return NextResponse.json({ error: "Unknown muscle group" }, { status: 404 })
  const [rows, uses] = await Promise.all([
    prisma.exerciseLibrary.findMany({
      where: { videoUrl: { not: null }, OR: [{ primaryMuscles: { has: group } }, { secondaryMuscles: { has: group } }] },
      select: { id: true, name: true, videoUrl: true, primaryMuscles: true, secondaryMuscles: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    usageCounts(),
  ])
  return NextResponse.json(
    { group, label: groupLabel(group), exercises: rankForGroup(rows, group, uses) },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } },
  )
}

export const GET = withAlert("learn/train", handleGET)
```

- [ ] **Step 8: Run the tests**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts`
Expected: PASS (setup plus 2 tests).

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/muscles/rank.ts tests/unit/muscles-rank.test.ts lib/muscles/usage.ts app/api/learn/train/route.ts tests/learn-train.spec.ts
git commit -m "learn: Train it API ranks a group's exercises by use" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 5: Ryan's review screen

**Files:**
- Create: `lib/muscles/validate.ts`, `tests/unit/muscles-validate.test.ts`, `lib/muscles/review.ts`, `tests/unit/muscles-review.test.ts`, `app/api/exercises/[id]/muscles/route.ts`, `app/coach/library/muscles/page.tsx`, `components/coach/MuscleReviewRow.tsx`
- Modify: `app/coach/library/page.tsx`, `tests/learn-train.spec.ts`

**Interfaces:**
- Consumes: `MUSCLE_GROUPS`, `GroupId`, `isGroupId`, `orderGroups` (Task 1); `exerciseKey` (`lib/exercise-key.ts`); the Prisma fields (Task 3); `usageCounts()` (Task 4); `canUseLibraryAi(email)` (`lib/library/access.ts`); `withAlert`; `VideoThumb`, `VideoPlayer`; `prisma`, `PREFIX`, `COACH`, `CLIENT`, `signIn` in `tests/learn-train.spec.ts` (Task 3).
- Produces:
  - `validateMuscles(body: unknown): { ok: true; value: { primary: GroupId[]; secondary: GroupId[] } } | { ok: false; error: string }` in `lib/muscles/validate.ts`
  - In `lib/muscles/review.ts`: `type ReviewTab = "todo" | "reviewed" | "untagged"`; `type ReviewInput = { id: string; name: string; videoUrl: string | null; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[]; musclesReviewedAt: Date | null }`; `type ReviewRow = { id: string; name: string; videoUrl: string | null; primary: GroupId[]; secondary: GroupId[]; reviewed: boolean; uses: number }`; `reviewList(rows: readonly ReviewInput[], uses: ReadonlyMap<string, number>, opts: { tab: ReviewTab; q?: string; page?: number; pageSize?: number; topN?: number }): { rows: ReviewRow[]; total: number; reviewedOfTop: number; topN: number }`
  - `PATCH /api/exercises/[id]/muscles` with `{ primary, secondary }`, answering `{ updated, primary, secondary, reviewedAt }`; 401 for anyone `canUseLibraryAi` refuses, 400 `{ error }` naming the bad value, 404 for an unknown id
  - Page `/coach/library/muscles` (404 for anyone `canUseLibraryAi` refuses), rows with test id `review-row`, progress line with test id `review-progress`; editor chips labelled `"<Label>: off|primary|secondary"`
  - A "Review muscles" link on `/coach/library` for the same people

- [ ] **Step 1: Write the failing validator and list tests**

`tests/unit/muscles-validate.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { validateMuscles } from "../../lib/muscles/validate"

test("valid lists come back in vocabulary order, each group once; empty lists are a valid answer", () => {
  assert.deepEqual(validateMuscles({ primary: ["hamstrings", "glutes", "glutes"], secondary: ["lower-back"] }), {
    ok: true,
    value: { primary: ["glutes", "hamstrings"], secondary: ["lower-back"] },
  })
  assert.deepEqual(validateMuscles({ primary: [], secondary: [] }), { ok: true, value: { primary: [], secondary: [] } })
})

test("an unknown group is refused by name", () => {
  assert.deepEqual(validateMuscles({ primary: ["quadriceps"], secondary: [] }), { ok: false, error: 'Unknown muscle group "quadriceps".' })
})

test("a group in both lists is refused by name", () => {
  assert.deepEqual(validateMuscles({ primary: ["glutes"], secondary: ["glutes"] }), { ok: false, error: `"glutes" can't be both primary and secondary.` })
})

test("anything but two lists of strings is refused", () => {
  for (const body of [null, "glutes", {}, { primary: "glutes", secondary: [] }, { primary: [], secondary: [3] }, { primary: [] }])
    assert.deepEqual(validateMuscles(body), { ok: false, error: "Send primary and secondary as lists of muscle groups." }, JSON.stringify(body))
})
```

`tests/unit/muscles-review.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { reviewList } from "../../lib/muscles/review"

const row = (id: string, name: string, primary: string[] = [], secondary: string[] = [], reviewed = false) => ({
  id,
  name,
  videoUrl: `https://youtu.be/${id}`,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  musclesReviewedAt: reviewed ? new Date("2026-10-14T12:00:00Z") : null,
})

const rows = [
  row("sq1", "Back Squat", ["glutes", "quads"]),
  row("sq2", "back squat", ["glutes", "quads"]),
  row("ht", "Hip Thrust", ["glutes"], ["hamstrings"], true),
  row("bike", "Air Bike"),
  row("pu", "Pull-Up", ["lats", "biceps"]),
]
const uses = new Map([["sq1", 5], ["sq2", 30], ["ht", 50], ["bike", 20], ["pu", 1]])

test("to review: unreviewed names, most used first; rows sharing a name are one entry with their uses added", () => {
  const out = reviewList(rows, uses, { tab: "todo" })
  assert.deepEqual(out.rows.map((r) => [r.id, r.uses]), [["sq2", 35], ["bike", 20], ["pu", 1]])
  assert.equal(out.total, 3)
})

test("the reviewed tab, and the no-tags tab (unreviewed names the rules left untagged)", () => {
  assert.deepEqual(reviewList(rows, uses, { tab: "reviewed" }).rows.map((r) => r.id), ["ht"])
  assert.deepEqual(reviewList(rows, uses, { tab: "untagged" }).rows.map((r) => r.id), ["bike"])
})

test("search narrows by name, ignoring case", () => {
  assert.deepEqual(reviewList(rows, uses, { tab: "todo", q: " SQUAT " }).rows.map((r) => r.id), ["sq2"])
})

test("progress counts the reviewed names among the most used", () => {
  // The two most used names are Hip Thrust (50, reviewed) and Back Squat (35, not).
  const out = reviewList(rows, uses, { tab: "todo", topN: 2 })
  assert.equal(out.reviewedOfTop, 1)
  assert.equal(out.topN, 2)
  assert.equal(reviewList(rows, uses, { tab: "todo" }).topN, 4) // fewer than 300 names: all of them
})

test("pages of the list", () => {
  const out = reviewList(rows, uses, { tab: "todo", page: 2, pageSize: 2 })
  assert.deepEqual(out.rows.map((r) => r.id), ["pu"])
  assert.equal(out.total, 3)
})

test("an entry shows its row's tags in vocabulary order", () => {
  assert.deepEqual(reviewList([row("x", "Odd", ["quads", "glutes"], ["adductors"])], new Map(), { tab: "todo" }).rows, [
    { id: "x", name: "Odd", videoUrl: "https://youtu.be/x", primary: ["glutes", "quads"], secondary: ["adductors"], reviewed: false, uses: 0 },
  ])
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find modules `../../lib/muscles/validate` and `../../lib/muscles/review`.

- [ ] **Step 3: Write the validator and the list**

`lib/muscles/validate.ts`:

```ts
import { isGroupId, orderGroups, type GroupId } from "./groups"

type Result = { ok: true; value: { primary: GroupId[]; secondary: GroupId[] } } | { ok: false; error: string }

const SHAPE = "Send primary and secondary as lists of muscle groups."
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string")

/** The review screen's PATCH body. Unknown groups and a group in both lists are refused by name. */
export function validateMuscles(body: unknown): Result {
  const { primary, secondary } = (typeof body === "object" && body !== null ? body : {}) as { primary?: unknown; secondary?: unknown }
  if (!isStrings(primary) || !isStrings(secondary)) return { ok: false, error: SHAPE }
  const unknown = primary.concat(secondary).find((g) => !isGroupId(g))
  if (unknown !== undefined) return { ok: false, error: `Unknown muscle group "${unknown}".` }
  const both = primary.find((g) => secondary.includes(g))
  if (both !== undefined) return { ok: false, error: `"${both}" can't be both primary and secondary.` }
  return { ok: true, value: { primary: orderGroups(primary), secondary: orderGroups(secondary) } }
}
```

`lib/muscles/review.ts`:

```ts
import { exerciseKey } from "../exercise-key"
import { orderGroups, type GroupId } from "./groups"

export type ReviewTab = "todo" | "reviewed" | "untagged"
export type ReviewInput = { id: string; name: string; videoUrl: string | null; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[]; musclesReviewedAt: Date | null }
export type ReviewRow = { id: string; name: string; videoUrl: string | null; primary: GroupId[]; secondary: GroupId[]; reviewed: boolean; uses: number }

/**
 * Ryan's review queue: one entry per exercise name, most used first. Rows sharing a name are one
 * entry: their uses add up and the most-used row stands for them (a save applies to all of them).
 * "todo" is every unreviewed name, "untagged" the unreviewed ones the rules left without tags.
 */
export function reviewList(
  rows: readonly ReviewInput[],
  uses: ReadonlyMap<string, number>,
  opts: { tab: ReviewTab; q?: string; page?: number; pageSize?: number; topN?: number },
) {
  const byName = new Map<string, { rep: ReviewInput; best: number; total: number }>()
  for (const r of rows) {
    const n = uses.get(r.id) ?? 0
    const key = exerciseKey(r.name)
    const seen = byName.get(key)
    if (!seen) {
      byName.set(key, { rep: r, best: n, total: n })
      continue
    }
    seen.total += n
    if (n > seen.best) {
      seen.rep = r
      seen.best = n
    }
  }
  const all: ReviewRow[] = Array.from(byName.values())
    .map(({ rep, total }) => ({
      id: rep.id,
      name: rep.name,
      videoUrl: rep.videoUrl,
      primary: orderGroups(rep.primaryMuscles),
      secondary: orderGroups(rep.secondaryMuscles),
      reviewed: !!rep.musclesReviewedAt,
      uses: total,
    }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
  const topN = Math.min(opts.topN ?? 300, all.length)
  const reviewedOfTop = all.slice(0, topN).filter((r) => r.reviewed).length
  const q = (opts.q ?? "").trim().toLowerCase()
  const inTab = all.filter((r) => {
    const tabOk = opts.tab === "reviewed" ? r.reviewed : !r.reviewed && (opts.tab === "todo" || (!r.primary.length && !r.secondary.length))
    return tabOk && (!q || r.name.toLowerCase().includes(q))
  })
  const size = opts.pageSize ?? 50
  const page = Math.max(1, opts.page ?? 1)
  return { rows: inTab.slice((page - 1) * size, page * size), total: inTab.length, reviewedOfTop, topN }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS, including the ten new tests.

- [ ] **Step 5: Write the failing end-to-end tests**

In `tests/learn-train.spec.ts`, add `import bcrypt from "bcryptjs"` to the imports, then append:

```ts
/** A coach who is neither an owner nor on the allowlist (the same account tests/library-ai.spec.ts uses). */
const STRANGER = { email: "playwright-libai-stranger@dev.local", password: "stranger-PW-1" }
async function ensureStranger() {
  await prisma.user.upsert({
    where: { email: STRANGER.email },
    update: {},
    create: { email: STRANGER.email, name: "Stranger Coach", role: "COACH", hashedPassword: await bcrypt.hash(STRANGER.password, 10), coachProfile: { create: {} } },
  })
}

test("review screen: one row per name; a chip edit saves on every row with that name, and Looks right confirms", async ({ browser }) => {
  const base = { category: "Custom", difficulty: "Any", videoUrl: "https://youtu.be/ccccccccccc", primaryMuscles: ["glutes"] }
  const a = await prisma.exerciseLibrary.create({ data: { ...base, name: `${PREFIX}Review Lift` } })
  const b = await prisma.exerciseLibrary.create({ data: { ...base, name: `${PREFIX.toLowerCase()}review lift` } })
  const hold = await prisma.exerciseLibrary.create({ data: { ...base, name: `${PREFIX}Review Hold`, primaryMuscles: ["abs"] } })
  const { ctx, page } = await signIn(browser, COACH)

  await page.goto("/coach/library")
  await page.getByRole("link", { name: "Review muscles" }).click()
  await expect(page).toHaveURL(/\/coach\/library\/muscles$/)
  await expect(page.getByTestId("review-progress")).toHaveText(/^Reviewed \d+ of the \d+ most-used\.$/)

  await page.goto(`/coach/library/muscles?q=${encodeURIComponent(`${PREFIX}Review`)}`)
  const rows = page.getByTestId("review-row")
  await expect(rows).toHaveCount(2) // three library rows, two names
  const lift = rows.filter({ hasText: /review lift/i })
  await expect(lift.getByRole("button", { name: "Looks right" })).toBeVisible()
  await lift.getByRole("button", { name: "Edit" }).click()
  await lift.getByRole("button", { name: "Hamstrings: off" }).click()
  await lift.getByRole("button", { name: "Hamstrings: primary" }).click()
  await expect(lift.getByRole("button", { name: "Hamstrings: secondary" })).toBeVisible()
  await lift.getByRole("button", { name: "Save" }).click()
  await expect(lift).toContainText("Reviewed")
  for (const id of [a.id, b.id]) {
    const r = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id } })
    expect([r.primaryMuscles, r.secondaryMuscles]).toEqual([["glutes"], ["hamstrings"]])
    expect(r.musclesReviewedAt).not.toBeNull()
  }

  const holdRow = rows.filter({ hasText: "Review Hold" })
  await holdRow.getByRole("button", { name: "Looks right" }).click()
  await expect(holdRow).toContainText("Reviewed")
  const h = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: hold.id } })
  expect(h.primaryMuscles).toEqual(["abs"])
  expect(h.musclesReviewedAt).not.toBeNull()

  // The API refuses what the vocabulary does not know.
  const bad = await page.request.patch(`/api/exercises/${hold.id}/muscles`, { data: { primary: ["quadriceps"], secondary: [] } })
  expect(bad.status()).toBe(400)
  expect((await bad.json()).error).toBe('Unknown muscle group "quadriceps".')
  await ctx.close()
})

test("review screen and its API: a coach who is not an owner gets a 404 and a 401, and so does a client", async ({ browser }) => {
  await ensureStranger()
  const stranger = await signIn(browser, STRANGER)
  expect((await stranger.page.goto("/coach/library/muscles"))?.status()).toBe(404)
  expect((await stranger.page.request.patch("/api/exercises/any/muscles", { data: { primary: [], secondary: [] } })).status()).toBe(401)
  await stranger.page.goto("/coach/library")
  await expect(stranger.page.getByRole("heading", { name: "Exercise Library" })).toBeVisible()
  await expect(stranger.page.getByRole("link", { name: "Review muscles" })).toHaveCount(0)
  await stranger.ctx.close()

  const client = await signIn(browser, CLIENT)
  expect((await client.page.goto("/coach/library/muscles"))?.status()).toBe(404)
  expect((await client.page.request.patch("/api/exercises/any/muscles", { data: { primary: [], secondary: [] } })).status()).toBe(401)
  await client.ctx.close()
})
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts -g "review screen"`
Expected: FAIL: the first test times out looking for the "Review muscles" link; the second fails on the PATCH (no route yet, so not 401).

- [ ] **Step 7: Write the route**

`app/api/exercises/[id]/muscles/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { exerciseKey } from "@/lib/exercise-key"
import { canUseLibraryAi } from "@/lib/library/access"
import { validateMuscles } from "@/lib/muscles/validate"
import { prisma } from "@/lib/prisma"

/**
 * Ryan confirms or corrects an exercise's muscles from the review screen.
 * Body: { primary: string[], secondary: string[] } (training-group ids, lib/muscles/groups.ts).
 * Saved on every library row with the same name (the library has duplicates, and clients should
 * see one answer) and stamped reviewed, so scripts/add-exercise-muscles.ts never redrafts them.
 */
async function handlePATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH" || !canUseLibraryAi(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const v = validateMuscles(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const target = await prisma.exerciseLibrary.findUnique({ where: { id: params.id }, select: { name: true } })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const key = exerciseKey(target.name)
  const all = await prisma.exerciseLibrary.findMany({ select: { id: true, name: true } })
  const ids = all.filter((r) => exerciseKey(r.name) === key).map((r) => r.id)
  const reviewedAt = new Date()
  const { count } = await prisma.exerciseLibrary.updateMany({
    where: { id: { in: ids } },
    data: { primaryMuscles: v.value.primary, secondaryMuscles: v.value.secondary, musclesReviewedAt: reviewedAt },
  })
  return NextResponse.json({ updated: count, primary: v.value.primary, secondary: v.value.secondary, reviewedAt: reviewedAt.toISOString() })
}

export const PATCH = withAlert("exercises/muscles", handlePATCH)
```

- [ ] **Step 8: Write the row**

`components/coach/MuscleReviewRow.tsx`:

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import VideoPlayer from "@/components/VideoPlayer"
import VideoThumb from "@/components/VideoThumb"
import { MUSCLE_GROUPS, type GroupId } from "@/lib/muscles/groups"
import type { ReviewRow } from "@/lib/muscles/review"

type Role = "primary" | "secondary"
type Roles = Partial<Record<GroupId, Role>>

const cycle = (r: Role | undefined): Role | undefined => (r === undefined ? "primary" : r === "primary" ? "secondary" : undefined)
const rolesOf = (row: ReviewRow): Roles => {
  const out: Roles = {}
  row.primary.forEach((g) => {
    out[g] = "primary"
  })
  row.secondary.forEach((g) => {
    out[g] = "secondary"
  })
  return out
}
const listOf = (roles: Roles, role: Role) => MUSCLE_GROUPS.map((g) => g.id).filter((id) => roles[id] === role)
const sameRoles = (a: Roles, b: Roles) => MUSCLE_GROUPS.every((g) => a[g.id] === b[g.id])

const CHIP: Record<Role | "off", string> = {
  primary: "border-primary-600 bg-primary-600 text-white",
  secondary: "border-primary-600 bg-white text-primary-700",
  off: "border-gray-300 bg-white text-gray-500",
}

/**
 * One exercise name on the review screen: its uses, demo, and current muscles. In the editor each
 * group chip cycles off, primary, secondary. One button marks it reviewed: "Looks right" confirms
 * the chips as they are, "Save" sends an edit. A saved row stays where it is, marked Reviewed.
 */
export default function MuscleReviewRow({ row }: { row: ReviewRow }) {
  const [saved, setSaved] = useState<Roles>(() => rolesOf(row))
  const [roles, setRoles] = useState<Roles>(saved)
  const [reviewed, setReviewed] = useState(row.reviewed)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const changed = !sameRoles(roles, saved)

  const save = async () => {
    setBusy(true)
    const res = await fetch(`/api/exercises/${row.id}/muscles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary: listOf(roles, "primary"), secondary: listOf(roles, "secondary") }),
    }).catch(() => null)
    setBusy(false)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) return toast.error(d.error ?? "Couldn't save. Try again.")
    setSaved(roles)
    setReviewed(true)
    setEditing(false)
  }

  const shown = MUSCLE_GROUPS.filter((g) => saved[g.id])
  return (
    <li data-testid="review-row" className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-start gap-3">
        {row.videoUrl && <VideoThumb compact url={row.videoUrl} title={row.name} onPlay={() => setPlaying(true)} className="w-24 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">
            {row.uses.toLocaleString()} {row.uses === 1 ? "use" : "uses"}
            {reviewed && <span className="ml-2 font-semibold text-green-700">Reviewed</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.length ? (
              shown.map((g) => (
                <span key={g.id} className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${CHIP[saved[g.id] ?? "off"]}`}>
                  {g.label}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500">No muscles</span>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Muscles for ${row.name}`}>
          {MUSCLE_GROUPS.map((g) => {
            const r = roles[g.id]
            return (
              <button
                key={g.id}
                type="button"
                aria-label={`${g.label}: ${r ?? "off"}`}
                onClick={() => setRoles((prev) => ({ ...prev, [g.id]: cycle(prev[g.id]) }))}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${CHIP[r ?? "off"]}`}
              >
                {g.label}
              </button>
            )
          })}
          <p className="w-full text-xs text-gray-500">Tap to cycle: off, primary (filled), secondary (outline).</p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          {editing ? "Close" : "Edit"}
        </button>
        <button type="button" onClick={() => void save()} disabled={busy} className="rounded bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          {changed ? "Save" : "Looks right"}
        </button>
      </div>
      {playing && row.videoUrl && <VideoPlayer items={[{ key: row.id, title: row.name, url: row.videoUrl }]} startIndex={0} onClose={() => setPlaying(false)} />}
    </li>
  )
}
```

- [ ] **Step 9: Write the page and the library link**

`app/coach/library/muscles/page.tsx`:

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import DashboardHeader from "@/components/DashboardHeader"
import MuscleReviewRow from "@/components/coach/MuscleReviewRow"
import { authOptions } from "@/lib/auth"
import { canUseLibraryAi } from "@/lib/library/access"
import { reviewList, type ReviewTab } from "@/lib/muscles/review"
import { usageCounts } from "@/lib/muscles/usage"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const TABS: { id: ReviewTab; label: string }[] = [
  { id: "todo", label: "To review" },
  { id: "reviewed", label: "Reviewed" },
  { id: "untagged", label: "No tags" },
]
// The library has about 4,500 names; a phone can't render them all at once.
const PAGE_SIZE = 50

/**
 * Ryan's queue for the muscles the name rules drafted: one row per exercise name, most used first,
 * so the exercises clients see most are checked first. Owners and LIBRARY_AI_COACH_EMAILS only.
 */
export default async function MuscleReviewPage({ searchParams }: { searchParams: { tab?: string; q?: string; page?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH" || !canUseLibraryAi(session.user.email)) notFound()
  const tab = TABS.find((t) => t.id === searchParams.tab)?.id ?? "todo"
  const q = (searchParams.q ?? "").trim()
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "", 10) || 1)
  const [rows, uses] = await Promise.all([
    prisma.exerciseLibrary.findMany({
      select: { id: true, name: true, videoUrl: true, primaryMuscles: true, secondaryMuscles: true, musclesReviewedAt: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    usageCounts(),
  ])
  const list = reviewList(rows, uses, { tab, q, page, pageSize: PAGE_SIZE })
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  const href = (t: ReviewTab, p = 1) => {
    const s = new URLSearchParams()
    if (t !== "todo") s.set("tab", t)
    if (q) s.set("q", q)
    if (p > 1) s.set("page", String(p))
    const qs = s.toString()
    return qs ? `/coach/library/muscles?${qs}` : "/coach/library/muscles"
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/coach/library" className="text-sm font-medium text-primary-600 hover:underline">
          ‹ Exercise Library
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Review muscles</h1>
        <p data-testid="review-progress" className="mt-1 text-gray-600">
          Reviewed {list.reviewedOfTop} of the {list.topN} most-used.
        </p>

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id)}
              aria-current={t.id === tab ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.id === tab ? "bg-primary-600 text-white" : "bg-white text-gray-700 shadow"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <form method="get" className="mt-4 flex gap-2">
          {tab !== "todo" && <input type="hidden" name="tab" value={tab} />}
          <input type="search" name="q" defaultValue={q} placeholder="Search name…" className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-base" />
          <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
            Search
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-500">
          {list.total.toLocaleString()} {list.total === 1 ? "exercise" : "exercises"}
        </p>
        {list.rows.length ? (
          <ul className="mt-2 space-y-3">
            {list.rows.map((r) => (
              <MuscleReviewRow key={r.id} row={r} />
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-gray-600">Nothing here.</p>
        )}

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            {page > 1 ? <Link href={href(tab, page - 1)} className="font-semibold text-primary-600">‹ Previous</Link> : <span />}
            <span className="text-gray-500">
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={href(tab, page + 1)} className="font-semibold text-primary-600">Next ›</Link> : <span />}
          </div>
        )}
      </div>
    </div>
  )
}
```

`app/coach/library/page.tsx`: in the header's action group, before the AI panel:

```tsx
          <div className="flex flex-wrap items-center gap-2">
            {aiAllowed && (
              <Link href="/coach/library/muscles" className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Review muscles
              </Link>
            )}
            {aiAllowed && meter && <LibraryAiPanel meter={meter} />}
            <AddExerciseButton />
          </div>
```

- [ ] **Step 10: Run the tests**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts`
Expected: PASS (setup plus 4 tests).

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/muscles/validate.ts tests/unit/muscles-validate.test.ts lib/muscles/review.ts tests/unit/muscles-review.test.ts "app/api/exercises/[id]/muscles/route.ts" app/coach/library/muscles/page.tsx components/coach/MuscleReviewRow.tsx app/coach/library/page.tsx tests/learn-train.spec.ts
git commit -m "muscles: Ryan's review screen and its API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 6: Train it on the Learn card

**Files:**
- Create: `components/learn/TrainIt.tsx`
- Modify: `components/learn/SceneView.tsx`, `tests/learn-train.spec.ts`

**Interfaces:**
- Consumes: `GroupId`, `groupOfStructure(structureId)` (Task 1); `GET /api/learn/train` and `type TrainRow` (Task 4); `VideoThumb` (`components/VideoThumb.tsx`, its button is labelled `Play <title> video`); `VideoPlayer` (`components/VideoPlayer.tsx`, its dialog is labelled `<title> video`); `window.__wodLearn.select(id)` and `.ready` from the Learn viewer; `signIn`, `CLIENT` in `tests/learn-train.spec.ts`.
- Produces: `<TrainIt group={GroupId} />` (default export of `components/learn/TrainIt.tsx`) with test ids `train-it` (the section, titled `Train it: <Label>`), `train-it-loading` and `train-it-error` ("Couldn't load exercises right now."). It renders nothing when the group has no exercises. Task 7 reuses it.

- [ ] **Step 1: Write the failing end-to-end tests**

In `tests/learn-train.spec.ts`, change the Playwright import to `import { test, expect, type Browser, type Page } from "@playwright/test"`, then append:

```ts
const ready = (page: Page) => page.waitForFunction(() => window.__wodLearn?.ready === true, null, { timeout: 90_000 })

test("muscles scene: gluteus maximus shows Train it: Glutes, a video opens the player, and a face muscle shows none", async ({ page }) => {
  await page.goto("/learn/muscles")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("gluteus-maximus-muscle"))
  const train = page.getByTestId("train-it")
  await expect(train).toContainText("Train it: Glutes")
  const first = train.getByRole("button", { name: /^Play .+ video$/ }).first()
  const title = (await first.getAttribute("aria-label"))!.replace(/^Play (.+) video$/, "$1")
  await first.click()
  await expect(page.getByRole("dialog", { name: `${title} video` })).toBeVisible()
  await page.getByRole("button", { name: "Close video" }).click()

  await page.evaluate(() => window.__wodLearn?.select("frontalis-muscle")) // in no training group
  await expect(page.getByTestId("structure-card")).toContainText("Frontalis")
  await expect(page.getByTestId("train-it")).toHaveCount(0)
})

test("client Learn pages show Train it too: rectus femoris on the knee is Quads", async ({ browser }) => {
  const { ctx, page } = await signIn(browser, CLIENT)
  await page.goto("/client/learn/knee")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("rectus-femoris-muscle"))
  await expect(page.getByTestId("train-it")).toContainText("Train it: Quads")
  await ctx.close()
})

test("Train it failing to load says so in one line and the card keeps working", async ({ page }) => {
  await page.route("**/api/learn/train**", (route) => route.abort())
  await page.goto("/learn/muscles")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("gluteus-maximus-muscle"))
  await expect(page.getByTestId("train-it-error")).toHaveText("Couldn't load exercises right now.")
  await expect(page.getByTestId("train-it-loading")).toHaveCount(0)
  await expect(page.getByTestId("structure-card")).toContainText("Gluteus maximus")
})

test("a group with no exercises shows no Train it section at all", async ({ page }) => {
  await page.route("**/api/learn/train**", (route) => route.fulfill({ json: { group: "glutes", label: "Glutes", exercises: [] } }))
  await page.goto("/learn/muscles")
  await ready(page)
  const answered = page.waitForResponse("**/api/learn/train**")
  await page.evaluate(() => window.__wodLearn?.select("gluteus-maximus-muscle"))
  await answered
  await expect(page.getByTestId("structure-card")).toContainText("Gluteus maximus")
  await expect(page.getByTestId("train-it-loading")).toHaveCount(0)
  await expect(page.getByTestId("train-it")).toHaveCount(0)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts -g "Train it"`
Expected: FAIL: no `train-it` section after selecting gluteus maximus or rectus femoris, no `train-it-error`, and `waitForResponse` times out because nothing asks the API yet. (The Task 4 API test also matches the filter and passes.)

- [ ] **Step 3: Write the component**

`components/learn/TrainIt.tsx`:

```tsx
'use client'

import { useEffect, useState } from "react"
import VideoPlayer from "@/components/VideoPlayer"
import VideoThumb from "@/components/VideoThumb"
import type { GroupId } from "@/lib/muscles/groups"
import type { TrainRow } from "@/lib/muscles/rank"

type Answer = { group: GroupId; label: string; exercises: TrainRow[] }

// One answer per group per page load. A failed request is not kept, so the next tap tries again.
const answers = new Map<GroupId, Answer>()

/** "Train it": up to six of Ryan's exercises for a muscle's training group, each with its demo video. */
export default function TrainIt({ group }: { group: GroupId }) {
  const [answer, setAnswer] = useState<Answer | null>(() => answers.get(group) ?? null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)

  useEffect(() => {
    if (answers.has(group)) return
    let live = true
    fetch(`/api/learn/train?group=${encodeURIComponent(group)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Answer>) : Promise.reject(new Error(`status ${r.status}`))))
      .then((a) => {
        answers.set(group, a)
        if (live) setAnswer(a)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [group])

  if (failed) {
    return (
      <p data-testid="train-it-error" className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-muted">
        Couldn&apos;t load exercises right now.
      </p>
    )
  }
  if (!answer) return <div data-testid="train-it-loading" className="h-40 animate-pulse rounded-2xl bg-app-surface2" aria-hidden="true" />
  if (!answer.exercises.length) return null
  return (
    <section data-testid="train-it" aria-label={`Train it: ${answer.label}`} className="space-y-3 rounded-2xl border border-app-border bg-app-surface p-4">
      <h3 className="font-display text-xl font-bold">Train it: {answer.label}</h3>
      <ul className="grid grid-cols-2 gap-3">
        {answer.exercises.map((e, i) => (
          <li key={e.id} className="min-w-0 space-y-1">
            <VideoThumb compact url={e.videoUrl} title={e.name} onPlay={() => setPlaying(i)} />
            <p className="text-sm font-semibold leading-tight">{e.name}</p>
          </li>
        ))}
      </ul>
      {playing !== null && (
        <VideoPlayer items={answer.exercises.map((e) => ({ key: e.id, title: e.name, url: e.videoUrl }))} startIndex={playing} onClose={() => setPlaying(null)} />
      )}
    </section>
  )
}
```

- [ ] **Step 4: Show it under the structure card**

`components/learn/SceneView.tsx`: add the imports

```tsx
import { groupOfStructure } from "@/lib/muscles/groups"
import TrainIt from "./TrainIt"
```

after `const role = ...` add

```tsx
  const group = selectedId ? groupOfStructure(selectedId) : null
```

and replace the card wrapper in the aside with

```tsx
        <div ref={cardRef} className="scroll-mt-4 space-y-3">
          <StructureCard structure={selected} role={role} movementLabel={scene.movement?.label} />
          {group && <TrainIt key={group} group={group} />}
        </div>
```

(`key` gives each group a fresh component, so a new selection never shows the last group's list.)

- [ ] **Step 5: Run the tests**

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts tests/learn.spec.ts`
Expected: PASS (setup plus every test in both files; the existing Learn tests still pass).

- [ ] **Step 6: Commit**

```bash
git add components/learn/TrainIt.tsx components/learn/SceneView.tsx tests/learn-train.spec.ts
git commit -m "learn: Train it lists a muscle's exercises with their videos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 7: Muscles worked in Learn

**Files:**
- Create: `components/learn/MusclesWorked.tsx`
- Modify: `lib/learn-viewer.ts`, `tests/unit/learn-viewer.test.ts`, `lib/muscles/groups.ts`, `tests/unit/muscles-groups.test.ts`, `components/learn/AnatomyViewer.tsx`, `components/learn/SceneView.tsx`, `tests/learn-train.spec.ts`

**Interfaces:**
- Consumes: `parseGroups`, `structuresOf`, `groupLabel`, `musclesHref`, `GroupId` (Task 1); `<TrainIt group />` (Task 6); `ready` in `tests/learn-train.spec.ts` (Task 6).
- Produces:
  - In `lib/learn-viewer.ts`: `type Highlight = { primary: ReadonlySet<string>; secondary: ReadonlySet<string> }` (structure ids) and `selectionStyle(partId, kind, selectedId, highlight: Highlight | null = null): { opacity: number; transparent: boolean; depthWrite: boolean; glow: 0 | 0.5 | 1 }` (glow was a boolean).
  - In `lib/muscles/groups.ts`: `parseWorked(get: (key: string) => string | null): { primary: GroupId[]; secondary: GroupId[]; from: string | null }` and `highlightOf(w: { primary: readonly GroupId[]; secondary: readonly GroupId[] }): Highlight | null`.
  - `ViewerProps.highlight: Highlight | null`; `window.__wodLearn.glow(id: string): number` (the glow last applied to that structure: 0, 0.5 or 1).
  - `<MusclesWorked worked onClear />` with test id `muscles-worked`; each group is a button named `"<Label> Main"` or `"<Label> Also"`.

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/muscles-groups.test.ts`: add `highlightOf` and `parseWorked` to the import from `../../lib/muscles/groups`, then append:

```ts
test("Muscles worked reads valid groups once each, never one group as both, and a short exercise name", () => {
  const q = new URLSearchParams("highlight=glutes,glutes,foo&also=glutes,hamstrings&from=Hip%20Thrust")
  assert.deepEqual(parseWorked((k) => q.get(k)), { primary: ["glutes"], secondary: ["hamstrings"], from: "Hip Thrust" })
  const empty = new URLSearchParams("highlight=&also=")
  assert.deepEqual(parseWorked((k) => empty.get(k)), { primary: [], secondary: [], from: null })
  const long = new URLSearchParams({ highlight: "quads", from: "x".repeat(200) })
  assert.equal(parseWorked((k) => long.get(k)).from?.length, 80)
})

test("the chip link and Learn agree", () => {
  const q = new URL(musclesHref({ primary: ["hamstrings", "glutes"], secondary: ["lower-back"] }, "Romanian Deadlift"), "https://wod.coach").searchParams
  assert.deepEqual(parseWorked((k) => q.get(k)), { primary: ["glutes", "hamstrings"], secondary: ["lower-back"], from: "Romanian Deadlift" })
})

test("a highlight holds each group's structures; nothing to light is no highlight", () => {
  const h = highlightOf({ primary: ["glutes"], secondary: ["calves"] })!
  assert.ok(h.primary.has("gluteus-maximus-muscle"))
  assert.ok(h.secondary.has("soleus-muscle"))
  assert.ok(!h.primary.has("soleus-muscle"))
  assert.equal(highlightOf({ primary: [], secondary: [] }), null)
})
```

`tests/unit/learn-viewer.test.ts`: in the two existing `selectionStyle` tests ("nothing selected..." and "with a selection..."), every `glow: false` becomes `glow: 0` and `glow: true` becomes `glow: 1`. Then add after them:

```ts
test("a Muscles worked highlight lights primary muscles fully and secondary at half, and fades the rest except bone", () => {
  const h = { primary: new Set(["gluteus-maximus-muscle"]), secondary: new Set(["semitendinosus-muscle"]) }
  assert.deepEqual(selectionStyle("gluteus-maximus-muscle", "muscle", null, h), { opacity: 1, transparent: false, depthWrite: true, glow: 1 })
  assert.deepEqual(selectionStyle("semitendinosus-muscle", "muscle", null, h), { opacity: 1, transparent: false, depthWrite: true, glow: 0.5 })
  assert.deepEqual(selectionStyle("vastus-lateralis-muscle", "muscle", null, h), { opacity: 0.35, transparent: true, depthWrite: false, glow: 0 })
  assert.deepEqual(selectionStyle("femur", "bone", null, h), { opacity: 1, transparent: false, depthWrite: true, glow: 0 })
})

test("a selection made on top of a highlight wins, as a selection always has", () => {
  const h = { primary: new Set(["gluteus-maximus-muscle"]), secondary: new Set<string>() }
  assert.deepEqual(selectionStyle("vastus-lateralis-muscle", "muscle", "vastus-lateralis-muscle", h), { opacity: 1, transparent: false, depthWrite: true, glow: 1 })
  assert.deepEqual(selectionStyle("gluteus-maximus-muscle", "muscle", "vastus-lateralis-muscle", h), { opacity: 0.35, transparent: true, depthWrite: false, glow: 0 })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:unit`
Expected: FAIL: `parseWorked is not a function` (and `highlightOf`), and the `selectionStyle` tests receive `glow: false`/`true` where they expect `0`/`1`.

- [ ] **Step 3: Write the failing end-to-end test**

Append to `tests/learn-train.spec.ts`:

```ts
test("Muscles worked: the link's groups are lit and listed, each opens its Train it, a tap still selects, and Show all muscles clears it", async ({ page }) => {
  await page.goto("/learn/muscles?highlight=glutes&also=hamstrings&from=Hip%20Thrust")
  await ready(page)
  const worked = page.getByTestId("muscles-worked")
  await expect(worked).toContainText("Muscles worked by Hip Thrust")
  await expect(worked.getByRole("button", { name: "Glutes Main" })).toBeVisible()
  await expect(worked.getByRole("button", { name: "Hamstrings Also" })).toBeVisible()
  await expect(page.getByTestId("structure-card")).toHaveCount(0) // Muscles worked takes the card's place
  const glow = (id: string) => page.evaluate((i) => window.__wodLearn?.glow(i), id)
  await expect.poll(() => glow("gluteus-maximus-muscle")).toBe(1)
  await expect.poll(() => glow("semitendinosus-muscle")).toBe(0.5)
  await expect.poll(() => glow("vastus-lateralis-muscle")).toBe(0)

  await worked.getByRole("button", { name: "Glutes Main" }).click()
  await expect(worked.getByTestId("train-it")).toContainText("Train it: Glutes")

  await page.evaluate(() => window.__wodLearn?.select("vastus-lateralis-muscle"))
  await expect(page.getByTestId("structure-card")).toContainText("Vastus lateralis")
  await expect.poll(() => glow("vastus-lateralis-muscle")).toBe(1)
  await expect.poll(() => glow("gluteus-maximus-muscle")).toBe(0)

  await worked.getByRole("button", { name: "Show all muscles" }).click()
  await expect(page).toHaveURL(/\/learn\/muscles$/)
  await expect(page.getByTestId("muscles-worked")).toHaveCount(0)
})
```

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts -g "Muscles worked"`
Expected: FAIL, no `muscles-worked` element.

- [ ] **Step 4: Teach the selection style about highlights**

`lib/learn-viewer.ts`: replace `selectionStyle` with

```ts
/** Structure ids Muscles worked lights: its primary groups fully, its secondary groups at half. */
export type Highlight = { primary: ReadonlySet<string>; secondary: ReadonlySet<string> }

/**
 * How a part looks given the selection or, with nothing selected, a Muscles worked highlight.
 * Everything else that is not bone fades, blends and stops writing depth so it never hides what
 * is lit. A selection always wins over the highlight.
 */
export function selectionStyle(partId: string | null, kind: Kind | null, selectedId: string | null, highlight: Highlight | null = null) {
  const glow: 0 | 0.5 | 1 = selectedId
    ? partId === selectedId ? 1 : 0
    : highlight && partId
      ? highlight.primary.has(partId) ? 1 : highlight.secondary.has(partId) ? 0.5 : 0
      : 0
  const faded = (!!selectedId || !!highlight) && glow === 0 && kind !== "bone"
  return { opacity: faded ? 0.35 : 1, transparent: faded, depthWrite: !faded, glow }
}
```

`lib/muscles/groups.ts`: add `import type { Highlight } from "../learn-viewer"` under the existing import, and after `musclesHref`:

```ts
/** Learn's Muscles worked parameters: main groups, other groups (never also main), and the exercise's name. */
export function parseWorked(get: (key: string) => string | null) {
  const primary = parseGroups(get("highlight"))
  const secondary = parseGroups(get("also")).filter((g) => !primary.includes(g))
  const from = (get("from") ?? "").trim().slice(0, 80) || null
  return { primary, secondary, from }
}

/** The structures Muscles worked lights, or null when it lights none. */
export function highlightOf(w: { primary: readonly GroupId[]; secondary: readonly GroupId[] }): Highlight | null {
  if (!w.primary.length && !w.secondary.length) return null
  const ids = (groups: readonly GroupId[]) => new Set(groups.reduce<string[]>((all, g) => all.concat(structuresOf(g)), []))
  return { primary: ids(w.primary), secondary: ids(w.secondary) }
}
```

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Light the highlight in the viewer**

`components/learn/AnatomyViewer.tsx`:
- Import `type Highlight` from `@/lib/learn-viewer` alongside the other helpers.
- `ViewerProps` gains, after `hiddenIds`:
  ```ts
  /** Muscles worked: what to light when nothing is selected (lib/muscles/groups.ts highlightOf). */
  highlight: Highlight | null
  ```
- `type Part` gains `glow: number`, and the part built in the loader becomes `const part: Part = { mesh, id: s ? id : null, kind, mat, glow: 0 }`.
- The `Window.__wodLearn` declaration gains `glow: (id: string) => number`, and the object set after loading gains
  ```ts
  glow: (id) => Math.max(0, ...(rig.byId.get(id) ?? []).map((p) => p.glow)),
  ```
- After loading: `applySelection(rig, propsRef.current.selectedId, propsRef.current.highlight)`.
- The selection effect becomes
  ```ts
  useEffect(() => { const r = rigRef.current; if (r) { applySelection(r, props.selectedId, props.highlight); r.invalidate?.() } }, [props.selectedId, props.highlight])
  ```
- `applySelection` becomes
  ```ts
  /**
   * Selected: accent glow. With nothing selected, Muscles worked lights its primary groups fully and
   * secondary ones at half. Everything else that is not bone fades to 35% and stops writing depth.
   * Only faded parts are transparent: opaque parts keep the cheap pass.
   */
  function applySelection(r: Rig, selectedId: string | null, highlight: Highlight | null) {
    for (const p of r.parts) {
      const st = selectionStyle(p.id, p.kind, selectedId, highlight)
      p.glow = st.glow
      p.mat.emissive.copy(r.accent).multiplyScalar(0.35 * st.glow)
      p.mat.opacity = st.opacity
      p.mat.transparent = st.transparent
      p.mat.depthWrite = st.depthWrite
      p.mat.needsUpdate = true
    }
  }
  ```

- [ ] **Step 6: Write the Muscles worked card**

`components/learn/MusclesWorked.tsx`:

```tsx
'use client'

import { useState } from "react"
import { groupLabel, type GroupId } from "@/lib/muscles/groups"
import TrainIt from "./TrainIt"

/**
 * Learn opened from an exercise in a client's session: the groups it works (main ones lit fully on
 * the model, the others at half), each opening its own Train it.
 */
export default function MusclesWorked({ worked, onClear }: { worked: { primary: GroupId[]; secondary: GroupId[]; from: string | null }; onClear: () => void }) {
  const [open, setOpen] = useState<GroupId | null>(null)
  const rows = worked.primary.map((g) => ({ g, main: true })).concat(worked.secondary.map((g) => ({ g, main: false })))
  return (
    <div data-testid="muscles-worked" className="space-y-3 rounded-2xl border border-app-border bg-app-surface p-4">
      <h2 className="font-display text-2xl font-bold leading-tight">{worked.from ? `Muscles worked by ${worked.from}` : "Muscles worked"}</h2>
      <ul className="space-y-2">
        {rows.map(({ g, main }) => (
          <li key={g} className="space-y-2">
            <button
              type="button"
              onClick={() => setOpen(open === g ? null : g)}
              aria-expanded={open === g}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-app-surface2 px-3 py-2 text-left"
            >
              <span className="font-semibold">{groupLabel(g)}</span> <span className="text-xs text-app-muted">{main ? "Main" : "Also"}</span>
            </button>
            {open === g && <TrainIt key={g} group={g} />}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClear} className="text-sm font-semibold text-app-accent">
        Show all muscles
      </button>
    </div>
  )
}
```

- [ ] **Step 7: Read the link in the scene view**

`components/learn/SceneView.tsx`:
- Imports become `import { usePathname, useRouter, useSearchParams } from "next/navigation"` and `import { groupOfStructure, highlightOf, parseWorked } from "@/lib/muscles/groups"`, plus `import MusclesWorked from "./MusclesWorked"`.
- Replace `const poster = useSearchParams().get("poster") === "1"` with
  ```tsx
  const params = useSearchParams()
  const poster = params.get("poster") === "1"
  // Muscles worked, opened from a client's session: ?highlight=glutes,hamstrings&also=lower-back&from=Romanian+Deadlift
  const worked = useMemo(() => parseWorked((k) => params.get(k)), [params])
  const highlight = useMemo(() => highlightOf(worked), [worked])
  const router = useRouter()
  const pathname = usePathname()
  ```
- Pass `highlight={highlight}` to `<AnatomyViewer>`.
- The card wrapper becomes
  ```tsx
        <div ref={cardRef} className="scroll-mt-4 space-y-3">
          {highlight && <MusclesWorked worked={worked} onClear={() => router.replace(pathname, { scroll: false })} />}
          {(selected || !highlight) && <StructureCard structure={selected} role={role} movementLabel={scene.movement?.label} />}
          {group && <TrainIt key={group} group={group} />}
        </div>
  ```

- [ ] **Step 8: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

Run: `npx playwright test --project=setup --project=learn`
Expected: PASS (setup, every `learn.spec.ts` test, and every `learn-train.spec.ts` test so far).

- [ ] **Step 9: Commit**

```bash
git add lib/learn-viewer.ts tests/unit/learn-viewer.test.ts lib/muscles/groups.ts tests/unit/muscles-groups.test.ts components/learn/AnatomyViewer.tsx components/learn/MusclesWorked.tsx components/learn/SceneView.tsx tests/learn-train.spec.ts
git commit -m "learn: Muscles worked lights an exercise's muscles from a link" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 8: Muscle chips in a client's session

**Files:**
- Create: `lib/muscles/resolve.ts`, `tests/unit/muscles-resolve.test.ts`
- Modify: `app/client/workouts/[id]/page.tsx`, `components/client/WorkoutPlayer.tsx`, `tests/learn-train.spec.ts`

**Interfaces:**
- Consumes: `orderGroups`, `groupLabel`, `musclesHref` (Task 1); the Prisma fields (Task 3); `MusclesWorked` on `/client/learn/muscles` (Task 7); `prisma`, `PREFIX`, `CLIENT`, `signIn` in `tests/learn-train.spec.ts`.
- Produces:
  - In `lib/muscles/resolve.ts`: `type Tags = { primary: string[]; secondary: string[] }`; `unlinkedNames(rows: readonly { name: string | null; exercise: unknown }[]): string[]`; `resolveMuscles(row: { name: string | null; exercise: { primaryMuscles: string[]; secondaryMuscles: string[] } | null }, sameName: readonly { name: string; primaryMuscles: string[]; secondaryMuscles: string[] }[]): Tags`.
  - `PlayerExercise.primaryMuscles?: string[]` and `PlayerExercise.secondaryMuscles?: string[]` (optional: the coach's in-person page, `app/coach/clients/[clientId]/workouts/[workoutId]/train/page.tsx`, renders the same player without them).
  - The chip link in each exercise row, test id `muscle-chips`.

Ruling recorded here for the executor: the spec matches unlinked rows on the same normalized name. Doing that in one query would mean loading the whole library on every session page view or reimplementing `exerciseKey` in SQL, so the page matches names ignoring case and outer spaces (Prisma `mode: "insensitive"`), which covers CoachRx imports that differ from the library by case. Cost if wrong: an unlinked row spelled differently ("Pull Up" against "Pull-Up") shows no chips.

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/muscles-resolve.test.ts`:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { resolveMuscles, unlinkedNames } from "../../lib/muscles/resolve"

const lib = (name: string, primary: string[], secondary: string[] = []) => ({ name, primaryMuscles: primary, secondaryMuscles: secondary })

test("a linked row shows its library exercise's muscles, even when that exercise has none", () => {
  assert.deepEqual(resolveMuscles({ name: "RDL", exercise: lib("Romanian Deadlift", ["glutes", "hamstrings"], ["lower-back"]) }, []), {
    primary: ["glutes", "hamstrings"],
    secondary: ["lower-back"],
  })
  assert.deepEqual(resolveMuscles({ name: "Air Bike", exercise: lib("Air Bike", []) }, [lib("Air Bike", ["quads"])]), { primary: [], secondary: [] })
})

test("an unlinked row borrows the muscles of a library exercise whose name differs only by case or outer spaces", () => {
  assert.deepEqual(resolveMuscles({ name: " pull-up ", exercise: null }, [lib("Pull-Up", ["lats", "biceps"], ["upper-back"])]), {
    primary: ["lats", "biceps"],
    secondary: ["upper-back"],
  })
})

test("among same-name library rows the first tagged one wins; no tagged match means no chips", () => {
  assert.deepEqual(resolveMuscles({ name: "back squat", exercise: null }, [lib("Back Squat", []), lib("BACK SQUAT", ["glutes", "quads"])]), { primary: ["glutes", "quads"], secondary: [] })
  assert.deepEqual(resolveMuscles({ name: "Mystery Drill", exercise: null }, [lib("Pull-Up", ["lats"])]), { primary: [], secondary: [] })
  assert.deepEqual(resolveMuscles({ name: null, exercise: null }, []), { primary: [], secondary: [] })
})

test("names to look up: unlinked rows only, trimmed, each once ignoring case", () => {
  const rows = [
    { name: "Pull-Up", exercise: null },
    { name: " pull-up", exercise: null },
    { name: "Back Squat", exercise: lib("Back Squat", []) },
    { name: null, exercise: null },
    { name: "  ", exercise: null },
    { name: "Ring Row ", exercise: null },
  ]
  assert.deepEqual(unlinkedNames(rows), ["Pull-Up", "Ring Row"])
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:unit`
Expected: FAIL, cannot find module `../../lib/muscles/resolve`.

- [ ] **Step 3: Write the module**

`lib/muscles/resolve.ts`:

```ts
export type Tags = { primary: string[]; secondary: string[] }
type LibraryTags = { name: string; primaryMuscles: string[]; secondaryMuscles: string[] }

const fold = (s: string) => s.trim().toLowerCase()

/** Names of workout rows with no library link, each once (ignoring case), for one same-name lookup. */
export function unlinkedNames(rows: readonly { name: string | null; exercise: unknown }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    if (r.exercise || !r.name?.trim()) continue
    const k = fold(r.name)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r.name.trim())
  }
  return out
}

/**
 * The muscles one workout row shows: its library exercise's when it is linked, else those of a
 * tagged library exercise with the same name (ignoring case), else none. CoachRx imports that
 * matched no library row get chips this way.
 */
export function resolveMuscles(
  row: { name: string | null; exercise: { primaryMuscles: string[]; secondaryMuscles: string[] } | null },
  sameName: readonly LibraryTags[],
): Tags {
  if (row.exercise) return { primary: row.exercise.primaryMuscles, secondary: row.exercise.secondaryMuscles }
  const k = row.name ? fold(row.name) : ""
  const hit = k ? sameName.find((l) => fold(l.name) === k && l.primaryMuscles.length > 0) : undefined
  return hit ? { primary: hit.primaryMuscles, secondary: hit.secondaryMuscles } : { primary: [], secondary: [] }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS, including the four new tests.

- [ ] **Step 5: Write the failing end-to-end test**

Append to `tests/learn-train.spec.ts`:

```ts
test.describe("Muscles worked chips in a client's session", () => {
  const WORKOUT = `${PREFIX}Session`
  let clientId = ""
  let workoutId = ""

  test.beforeAll(async () => {
    clientId = (await prisma.user.findUniqueOrThrow({ where: { email: CLIENT.email } })).id
    await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
    await prisma.workout.deleteMany({ where: { clientId, name: WORKOUT } })
    const lift = { category: "Custom", difficulty: "Any" }
    const rdl = await prisma.exerciseLibrary.create({
      data: { ...lift, name: `${PREFIX}Romanian Deadlift`, videoUrl: "https://youtu.be/ddddddddddd", primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["lower-back"] },
    })
    await prisma.exerciseLibrary.create({
      data: { ...lift, name: `${PREFIX}Hip Thrust Chips`, videoUrl: "https://youtu.be/eeeeeeeeeee", primaryMuscles: ["glutes"], secondaryMuscles: ["side-glutes", "hamstrings"] },
    })
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")
    const w = await prisma.workout.create({
      data: {
        clientId, name: WORKOUT, scheduledDate: today, dayOfWeek: today.getUTCDay(), order: 1,
        exercises: {
          create: [
            { name: `${PREFIX}Romanian Deadlift`, exerciseId: rdl.id, prescription: "3x8", order: 1 },
            { name: "pw train hip thrust chips", prescription: "3x10", order: 2 }, // unlinked; the library spells it in title case
            { name: `${PREFIX}Mystery Drill`, prescription: "2x5", order: 3 }, // unlinked, no library match
          ],
        },
      },
    })
    workoutId = w.id
  })

  test.afterAll(async () => {
    await prisma.workout.deleteMany({ where: { clientId, name: WORKOUT } })
  })

  test("each tagged exercise shows its main muscles, and a chip opens Learn with them lit", async ({ browser }) => {
    const { ctx, page } = await signIn(browser, CLIENT)
    await page.goto(`/client/workouts/${workoutId}`)
    const row = (name: string) => page.locator("li", { has: page.getByText(name, { exact: true }) })
    await expect(row(`${PREFIX}Romanian Deadlift`).getByTestId("muscle-chips")).toContainText("Glutes · Hamstrings")
    const borrowed = row("pw train hip thrust chips").getByTestId("muscle-chips")
    await expect(borrowed).toContainText("Glutes")
    await expect(borrowed).toHaveAttribute("href", "/client/learn/muscles?highlight=glutes&also=side-glutes%2Chamstrings&from=pw+train+hip+thrust+chips")
    await expect(row(`${PREFIX}Mystery Drill`).getByTestId("muscle-chips")).toHaveCount(0)

    await row(`${PREFIX}Romanian Deadlift`).getByTestId("muscle-chips").click()
    await page.waitForURL(/\/client\/learn\/muscles\?highlight=glutes%2Chamstrings&also=lower-back&from=/)
    await expect(page.getByTestId("muscles-worked")).toContainText(`Muscles worked by ${PREFIX}Romanian Deadlift`)
    await ctx.close()
  })
})
```

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts -g "chips"`
Expected: FAIL, no `muscle-chips` link in the first row.

- [ ] **Step 6: Resolve muscles on the session page**

`app/client/workouts/[id]/page.tsx`:
- Import `import { resolveMuscles, unlinkedNames } from "@/lib/muscles/resolve"`.
- The exercise include selects the muscles too:
  ```ts
  include: { exercise: { select: { id: true, name: true, videoUrl: true, tracking: true, primaryMuscles: true, secondaryMuscles: true } } },
  ```
- Replace the `Promise.all` for `profile` and `coachLink` with one that also looks up same-name library rows for unlinked exercises:
  ```ts
  // Rows imported without a library match still get chips from a library exercise of the same name
  // (ignoring case), found in one query for the whole session.
  const names = unlinkedNames(workout.exercises)
  const [profile, coachLink, sameName] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.clientCoach.findFirst({
      where: { clientId: session.user.id, status: "ACTIVE" },
      select: { coach: { select: { coachProfile: { select: { defaultRestSeconds: true } } } } },
    }),
    names.length
      ? prisma.exerciseLibrary.findMany({
          where: { OR: names.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })) },
          select: { name: true, primaryMuscles: true, secondaryMuscles: true },
        })
      : Promise.resolve([]),
  ])
  ```
- In the `exercises={workout.exercises.map((e) => { ... })}` mapping, add `const muscles = resolveMuscles(e, sameName)` after `const x = byExercise.get(e.id)`, and two fields to the returned object:
  ```ts
          primaryMuscles: muscles.primary,
          secondaryMuscles: muscles.secondary,
  ```

- [ ] **Step 7: Show the chips in the player**

`components/client/WorkoutPlayer.tsx`:
- Import `import { groupLabel, musclesHref, orderGroups } from "@/lib/muscles/groups"`.
- `PlayerExercise` gains, after `videoUrl`:
  ```ts
  /** Training groups for the Muscles worked chips (lib/muscles/groups.ts). The client page sets them; the coach's in-person page does not. */
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
  ```
- Add next to `TextBlock`:
  ```tsx
  /** Up to three main muscles ("Glutes · Hamstrings"), opening Learn's muscles scene with them lit. */
  function MuscleChips({ e }: { e: PlayerExercise }) {
    const primary = orderGroups(e.primaryMuscles ?? [])
    if (!primary.length) return null
    const labels = primary.slice(0, 3).map(groupLabel)
    return (
      <div className="-mt-2 pb-3 pl-14 pr-4">
        <Link
          data-testid="muscle-chips"
          href={musclesHref({ primary, secondary: e.secondaryMuscles ?? [] }, e.name)}
          aria-label={`Muscles worked: ${labels.join(", ")}`}
          className="inline-flex max-w-full items-center gap-1 rounded-xl bg-app-surface2 px-2.5 py-1 text-xs font-semibold text-app-muted"
        >
          {labels.join(" · ")}
          <span aria-hidden="true" className="text-app-accent">›</span>
        </Link>
      </div>
    )
  }
  ```
- In each exercise row, right after the header `<div className="flex items-center gap-3 p-4">...</div>` (the one holding the name button and the `VideoThumb`), add:
  ```tsx
              {!coaching && <MuscleChips e={e} />}
  ```
  (`pl-14` lines the chips up with the exercise name: 16 px padding, the 28 px number badge and its 12 px gap.)

- [ ] **Step 8: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

Run: `npx playwright test --project=setup --project=learn tests/learn-train.spec.ts`
Expected: PASS (setup plus every test in the file).

Run: `npx playwright test --project=setup --project=chromium tests/logging.spec.ts tests/coach-train.spec.ts tests/distance-tracking.spec.ts`
Expected: PASS (the player's existing flows, including the coach's in-person page, are unchanged).

- [ ] **Step 9: Commit**

```bash
git add lib/muscles/resolve.ts tests/unit/muscles-resolve.test.ts "app/client/workouts/[id]/page.tsx" components/client/WorkoutPlayer.tsx tests/learn-train.spec.ts
git commit -m "client: muscle chips on each exercise open Learn's Muscles worked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014P1rZ5c8H9gSuwuNeLWeZY"
```

---

### Task 9: Whole-branch checks and the production hand-off

**Files:**
- No new code. This task proves the branch and prepares what Ryan has to approve.

**Interfaces:**
- Consumes: everything above; `scripts/check-db-schema.ts` (the deploy guard); `scripts/add-exercise-muscles.ts` (Task 3).
- Produces: a green branch, and in the ledger the two dry-run summary lines for `public` that go to Ryan with the PR.

- [ ] **Step 1: Unit tests, types and lint**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: every unit test passes, `tsc` prints nothing, lint prints "No ESLint warnings or errors".

- [ ] **Step 2: The deploy guard against preview**

Run: `npx tsx --env-file=.env.local scripts/check-db-schema.ts --check`
Expected: `[schema-check] preview: every column the code reads is present`.

- [ ] **Step 3: Production build**

Stop the dev server first (TaskStop); `next build` and `next dev` share `.next`.

Run: `npm run build > .superpowers/sdd/2026-10-14-learn-train-it/build.log 2>&1; tail -40 .superpowers/sdd/2026-10-14-learn-train-it/build.log`
Expected: the build finishes; the route list shows `/api/learn/train`, `/api/exercises/[id]/muscles` and `/coach/library/muscles` as dynamic (ƒ), and the Learn scene pages still prerendered.

- [ ] **Step 4: The whole browser suite**

Start `npm run dev` again in the background and wait for `http://127.0.0.1:3011/learn`.

Run: `npx playwright test > .superpowers/sdd/2026-10-14-learn-train-it/e2e.log 2>&1; tail -60 .superpowers/sdd/2026-10-14-learn-train-it/e2e.log`
Expected: every test passes. A failure in a file this branch did not touch: run that file once more on its own. If it passes, ledger it as a flake with its error line (the AI assistant undo test has stalled on a remote-database transaction timeout before). If it fails again, it is a finding: debug it before going on.

- [ ] **Step 5: What production will need (read-only)**

Run: `npx tsx scripts/add-exercise-muscles.ts public`
Expected: the two summary lines for `public`, the second ending "(dry run: the columns do not exist yet, pass --apply)", and the sample. Nothing is written. Copy the two summary lines into the ledger as `Production dry run: ...`; they go to Ryan with the PR.

- [ ] **Step 6: Hand-off (no commands in this task)**

- The PR is opened through superpowers:finishing-a-development-branch: base `feat/learn-anatomy` (GitHub moves it to `master` when PR #4 merges), created as rdobbeck (`gh auth switch -u rdobbeck`, then `gh auth switch -u unigamblers-stack` afterwards). The PR body includes the production dry-run lines and the order below.
- `npx tsx scripts/add-exercise-muscles.ts public --apply` runs only after Ryan says yes in chat, and before this branch merges to `master`. Without it the deploy guard stops master's build (the live version stays up, but nothing ships).
- After the production run, rerun `npx tsx scripts/add-exercise-muscles.ts public` and expect `0 row(s) to write`.
