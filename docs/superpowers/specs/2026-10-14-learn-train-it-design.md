# Learn: Train it and Muscles worked

Date: 2026-10-14. Status: approved in conversation, pending written review.
Builds on: `docs/superpowers/specs/2026-10-14-learn-anatomy-design.md` (branch `feat/learn-anatomy`, PR #4).

## Why

Learn shows clients what a muscle is and what it does. Ryan wants it to also show how to train it,
with his demo videos, and wants a client looking at a session to see what each exercise works. The
main audience is his clients inside the app; the public Learn pages get the same "Train it" lists
as a reason to come back and to book.

Aesthetics and performance guides (V-taper, a bigger squat) are the next round, in their own spec.
They are mostly writing and reuse everything built here.

## Facts this design rests on

Read on 2026-10-14 from the database (production schema `public`, read-only):

- The library has 4,567 exercises. Every one has a YouTube demo link.
- No exercise has muscle data. The column named `muscleGroups` holds CoachRx movement patterns
  (Push, Pull, Squat, Bend, Lunge, Core and others), and many staples (Pull-Up, Barbell Glute Bridge,
  Hip Thrust) have none.
- Ryan's programs and client logs use 961 different library exercises, 19,089 times in all. The
  most used are concentrated:

| Most-used exercises | Share of all uses |
|---|---|
| 100 | 49% |
| 200 | 69% |
| 300 | 80% |
| 500 | 92% |

- 3,943 workout rows have no library link (CoachRx imports that matched no library exercise).

## What changes, in one paragraph

Each library exercise gains primary muscles, secondary muscles and a reviewed date. A fixed list of
about two dozen training groups (quads, hamstrings, glutes, lats and so on) maps each group to the
Learn structures it covers. Name rules tag the whole library automatically, marked unreviewed, and
Ryan corrects them on an owner-only review screen that lists the most-used exercises first. The
Learn card for any muscle gains "Train it": up to six exercises with their videos. Each exercise in
a client's session gains muscle chips that open the 3D muscles scene with those muscles lit.

## 1. Training groups

A fixed vocabulary in `lib/muscles.ts`, each group with an id, a gym label, and the Learn structure
ids it covers. The structure lists live in `data/anatomy/authored/muscle-groups.json` so Ryan can
adjust them; the ids and labels stay in code so types and tests can rely on them.

| id | Label | Learn structures (muscles scene) |
|---|---|---|
| `chest` | Chest | the three parts of pectoralis major, pectoralis minor |
| `front-delts` | Front delts | clavicular part of deltoid |
| `side-delts` | Side delts | acromial part of deltoid |
| `rear-delts` | Rear delts | scapular spinal part of deltoid |
| `rotator-cuff` | Rotator cuff | supraspinatus, infraspinatus, teres minor, subscapularis |
| `lats` | Lats | latissimus dorsi, teres major |
| `upper-back` | Upper back | rhomboids, middle and lower trapezius |
| `traps` | Traps | upper trapezius, levator scapulae |
| `serratus` | Serratus | serratus anterior |
| `biceps` | Biceps | both heads of biceps brachii, brachialis |
| `triceps` | Triceps | three heads of triceps brachii, anconeus |
| `forearms` | Forearms and grip | wrist and finger flexors and extensors, brachioradialis, pronators, supinator |
| `abs` | Abs | rectus abdominis, transversus abdominis, pyramidalis |
| `obliques` | Obliques | external and internal oblique |
| `lower-back` | Lower back | erector spinae (iliocostalis, longissimus, spinalis), multifidus, quadratus lumborum |
| `glutes` | Glutes | gluteus maximus |
| `side-glutes` | Side glutes | gluteus medius, gluteus minimus, tensor fasciae latae |
| `hip-rotators` | Deep hip rotators | piriformis, gemelli, obturators, quadratus femoris |
| `hip-flexors` | Hip flexors | iliacus, psoas major, sartorius |
| `quads` | Quads | rectus femoris, the three vasti |
| `hamstrings` | Hamstrings | both heads of biceps femoris, semitendinosus, semimembranosus |
| `adductors` | Adductors | adductor longus, brevis, magnus and minimus, gracilis, pectineus |
| `calves` | Calves | both heads of gastrocnemius, soleus, plantaris |
| `shins` | Shins and ankles | tibialis anterior and posterior, the fibularis muscles, long toe extensors |
| `neck` | Neck | sternocleidomastoid, scalenes, splenius, longus colli and capitis |

Rules: a structure belongs to at most one group; every group has at least one structure; every
structure id exists in the muscles scene of `data/anatomy/learn.json`. A unit test enforces all
three. Structures in no group (face, bursae, fasciae) simply show no "Train it".

`lib/muscles.ts` also exports `normalizeName(name)`: lower case, punctuation and brackets removed,
whitespace collapsed ("Pull-Up" and "pull up" match). Duplicates and unlinked workout rows are
matched on it.

## 2. Data

`prisma/schema.prisma`, model `ExerciseLibrary`:

```prisma
  primaryMuscles    String[]  @default([]) @map("primary_muscles")    // training-group ids, lib/muscles.ts
  secondaryMuscles  String[]  @default([]) @map("secondary_muscles")
  musclesReviewedAt DateTime? @map("muscles_reviewed_at")              // set when Ryan confirms or edits
```

A group is never in both lists. Values outside the vocabulary are rejected on write.

Rollout follows the project's column scripts (`scripts/add-exercise-tracking.ts` is the model):
`scripts/add-exercise-muscles.ts <schema> [--apply]` adds the three columns with `ADD COLUMN IF NOT
EXISTS`, then tags every row whose `muscles_reviewed_at` is null using the name rules (section 3),
printing a summary and a sample before writing. It is safe to re-run and never touches reviewed rows.

Order, because the deploy guard (`scripts/check-db-schema.ts`) fails a build whose schema lacks a
column the code reads: run on `preview` before pushing code that reads the columns; run on `public`
before PR merge, with Ryan's go-ahead each time it touches production.

## 3. Tagging

`lib/muscles/infer.ts` exports `inferMuscles(name: string): { primary: GroupId[]; secondary: GroupId[] }`,
a pure function over ordered name rules, most specific first. Examples of the intent:

| Name contains | Primary | Secondary |
|---|---|---|
| hip thrust, glute bridge | glutes | hamstrings, side-glutes |
| romanian deadlift, RDL, good morning | hamstrings, glutes | lower-back |
| deadlift | glutes, hamstrings | quads, lower-back, traps, forearms |
| split squat, lunge, step-up, shrimp squat, pistol | quads, glutes | adductors, side-glutes |
| squat | quads, glutes | adductors, lower-back |
| bench press, push-up, dip | chest, triceps | front-delts |
| strict, push, shoulder or overhead press, handstand push-up | front-delts, triceps | side-delts, serratus |
| pull-up, chin-up, pulldown, rope climb | lats, biceps | upper-back, rear-delts, forearms |
| row | upper-back, lats | rear-delts, biceps |
| pull-apart, face pull, reverse fly | rear-delts, upper-back | rotator-cuff |
| side plank, pallof | obliques | abs |
| plank, dead bug, hollow, leg raise, L-sit, sit-up | abs | obliques, hip-flexors |
| carry | forearms, traps | abs, obliques |
| kettlebell swing | glutes, hamstrings | lower-back |
| calf raise | calves | |

Names that match no rule stay untagged: conditioning (air bike, run), mobility and stretches, and
skill drills. Untagged exercises appear in neither "Train it" nor muscle chips.

Tags show to clients as soon as they exist, reviewed or not, so the feature works on day one. The
review queue is ordered by use, so the exercises clients see most are the first Ryan corrects. The
alternative, showing only reviewed tags, keeps everything hidden until the review is done. The rules are
calibrated by hand against the 300 most-used exercises; a unit test pins the expected tags of at
least 40 of them, including the top 20 by use.

New exercises are tagged on create with the same function, unreviewed: both the coach library's
add path and the AI library builder's save path (`app/api/library/ai/save/route.ts`) call
`inferMuscles` on the saved name.

## 4. Ryan's review screen

`/coach/library/muscles`, owner accounts only (the `ownerEmails()` gate the AI library builder
uses). A list of exercises ordered by use, one row per normalized name, with filters To review
(default), Reviewed, and No tags, and a progress line ("Reviewed 120 of the 300 most-used").

Each row shows the name, its use count, the video thumbnail, and the current chips. Tapping a group
chip in the row's editor cycles it off, primary, secondary, off. One button saves the chips and sets
the reviewed date; it reads "Looks right" while the chips are unchanged and "Save" after an edit. An
exercise can be marked reviewed with no muscles (a mobility drill, for example), which takes it out
of the queue.

API: `PATCH /api/exercises/[id]/muscles` with `{ primary: string[], secondary: string[] }`, owner
only, validated against the vocabulary (unknown id or a group in both lists is a 400 naming it), sets
`musclesReviewedAt` to now. Also applied to every library row with the same normalized name, since
the library carries duplicates (two "Back Squat" rows, for example) and clients should see one answer.

## 5. Train it

On the Learn structure card, when the selected structure belongs to a group: a "Train it" section
titled with the group's label ("Train it: Glutes"), listing up to six exercises, each a video
thumbnail and name. Tapping opens the existing `VideoPlayer` with the six as a playlist.

Order: exercises with the group as primary first, then as secondary; within each, by how often Ryan
programs and clients log them (WorkoutExercise and ExerciseLog rows), then by name. Rows with the
same normalized name collapse to the most-used one.

`GET /api/learn/train?group=<id>` returns `{ group, label, exercises: [{ id, name, videoUrl, role }] }`.
Public (the library is Ryan's catalogue, and the public Learn pages show it too). Unknown group: 404.
Cached at the edge: `Cache-Control: public, s-maxage=600, stale-while-revalidate=86400`. The
ranking is a pure function in `lib/muscles/rank.ts` so it is unit tested without a database.

Shown on both public and client Learn pages, on every scene where a muscle can be selected.

## 6. Muscles worked

`components/client/WorkoutPlayer.tsx`: each exercise row with tags shows up to three primary-group
chips in vocabulary order ("Glutes · Hamstrings"). Tapping goes to
`/client/learn/muscles?highlight=glutes,hamstrings&also=lower-back&from=Romanian%20Deadlift`.

Tags come from the linked library exercise; the workout page's query (`app/client/workouts/[id]/page.tsx`)
selects the two muscle columns. For a row with no library link, the page looks up a library exercise
with the same normalized name, in one query for the whole workout; if none, no chips.

Learn reads `highlight` (primary groups) and `also` (secondary groups) from the URL, ignoring unknown
ids. The viewer lights the primary groups' structures with the theme accent, the secondary groups'
at half strength, and fades everything else that is not bone, the way a single selection does now.
The card shows "Muscles worked by Romanian Deadlift": the groups as tappable rows, each opening its
own "Train it". Tapping a structure on the model still selects it as before; a "Show all muscles"
link clears the highlight.

## 7. Testing

Unit (`npm run test:unit`):
- Vocabulary: every structure exists in the muscles scene, none is in two groups, none of the groups
  is empty, labels have no long dashes.
- `inferMuscles`: at least 40 named exercises from the most-used list, plus untagged cases (Air Bike,
  Sidelying Windmill) and no group in both lists.
- Ranking: primary before secondary, use count order, name tie-break, duplicate names collapse.
- URL parsing of `highlight` and `also`, including unknown ids and empty values.
- The PATCH validator: unknown id, a group in both lists, non-array input.

End to end (Playwright `learn` project, preview database after `add-exercise-muscles.ts preview
--apply`, test rows prefixed and cleaned up):
- Muscles scene: select gluteus maximus, the card shows "Train it: Glutes" with at least one video;
  tapping it opens the player.
- A client's session with a tagged exercise shows its chips; tapping one opens Learn with
  "Muscles worked by" and the right groups.
- The review screen: an owner toggles a chip and presses "Looks right"; the database row has the new
  tags and a reviewed date. A non-owner gets a 404.

## 8. Rollout

Branch `feat/learn-train-it` from `feat/learn-anatomy`, PR against `feat/learn-anatomy` (GitHub moves
it to `master` when PR #4 merges). `add-exercise-muscles.ts` runs on `preview` before the first push
that reads the columns, and on `public` only after Ryan approves, before merge.

## Out of scope

Aesthetics and performance guides (next spec), the personal muscle heat map, Ask AI answers about
muscles, muscle chips in the coach session editor, changing the AI library builder's prompt (it gets
tags from the name rules on save instead), and a "See all" list beyond six exercises.
