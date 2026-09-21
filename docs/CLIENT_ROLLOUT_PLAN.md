# Client Rollout Plan (week of Sep 21, 2026)

**Goal:** 2-3 pilot clients train from WOD Coach by **Fri Sep 25**, with their CoachRx
program, profile and workout history ported over. Simple, mobile-first UX. After cutover
the pilot clients are programmed in WOD Coach only (CoachRx stays for everyone else).

**Decisions made**
- Pilot: 2-3 clients, not the whole roster.
- Cutover: import once, then WOD Coach is the source of truth for pilot clients.
- Client login: coach-generated invite link, client sets a password (no email service).
- Test login (demo coach/client) stays available on localhost + previews only.
- Pilots: **Sasha Letchinger** and **Andrew Thresher**.
- New block for each pilot, designed by Ryan. Recommended: build it in CoachRx as a
  normal program template by Thu; the importer brings it over and schedules it.
- Logging: a **result text box per exercise** (same as CoachRx, imports 1:1) plus an
  optional **"+ sets"** control for per-set reps/weight.

**Where things stand (Sep 21)**
- DB restored and clean; 4,542 CoachRx exercises synced into `ExerciseLibrary` daily.
- Schema already models Program → Mesocycle → Microcycle → Workout → WorkoutExercise,
  plus WorkoutLog → SetLog.
- Client side is a shell: `/client` dashboard exists, but `/client/workouts`, `/progress`,
  `/profile`, `/messages` are dead links and there is no workout logging code anywhere.
- Coach side has client list/detail, program list/detail, AI builder, exercise library.

---

## Discovery results (Sep 21) — pilots: Sasha Letchinger, Andrew Thresher

Samples in `backups/coachrx-samples/` (gitignored). Read via `scripts/lib/coachrx-read.ts`
(GET-only allowlist; fetch started in-tab then polled, since OpenTabs kills scripts at 10s).

| | Sasha (`sasha-letchinger`) | Andrew (`andrew-thresher`) |
|---|---|---|
| Workouts on calendar | 135 (Apr 2025 → Sep 4 2026) | 110 (→ Aug 21 2026) |
| Completed / missed | 66 / 69 | 19 / 91 |
| Exercise rows with a logged result | 195 | 62 |
| Programs seen | 16-Week GPP, Calisthenics Strength P5, 4-Phase Squat | 16-Week GPP, Chest/Hamstring/Abs hypertrophy, Brace Builder |
| **Upcoming workouts** | **none** | **none** |

What this means:
- **Results are free text per exercise** ("20 - 30 - 30 - 40 kg", "10 x 65 / 10 x 75"),
  not per-set numbers. RPE and duration were never used. Some workouts have comments.
- **Client calendar rows carry no exercise IDs.** Program templates do
  (`/programs/<id>/workouts.json` → `workout_item_exercises_attributes[].exercise_id` +
  video `url`; 229/285 rows linked in 16-Week GPP). History rows get linked by name match.
- **Neither pilot has anything scheduled.** Their programming ran out Aug 21 / Sep 4, so
  "port the current program" means importing history and then assigning a new block.
- Profile has name, email, age, birthday, weight, priorities; `user` has height, phone,
  gender, units, timezone, emergency contact.
- Date-range params on client workouts: `?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  (without them the endpoint returns `[]`).

## Day 1 (Mon-Tue): Schema prep

Authorization granted Sep 21 (read-only GETs; see memory/plan above). Discovery done.

Tasks
1. ~~Pull samples + field map~~ done (see Discovery results).
2. ~~Pick pilots~~ done: Sasha Letchinger, Andrew Thresher.
3. Schema additions (expected, confirm against samples):
   - `coachrxId` (unique, nullable) on Program, Workout, WorkoutLog, User → idempotent re-runs
   - Workout: `coachNotes`, `warmup`, `cooldown` (CoachRx workouts carry all three)
   - WorkoutExercise: `prescription` text (CoachRx rows are often "3x8 @ RPE 7"),
     `supersetGroup`; relax `sets`/`reps` to optional
   - New `ExerciseLog` (workoutLogId, workoutExerciseId, `resultText`, status) — the
     per-exercise text result; SetLog stays for the optional per-set rows, tolerant of
     missing reps/weight
   - WorkoutLog: `status` (completed/missed), `clientNotes`; `WorkoutComment` for the
     CoachRx comment threads

## Day 2: Importer

`scripts/import-coachrx.ts --client <slug>` (paced like the exercise sync, ~1 call/sec):
1. Client → `User` (CLIENT) + `ClientProfile` + `ClientCoach` link to Ryan.
2. Their active program → `Program` with one Mesocycle ("Imported from CoachRx"),
   one Microcycle per week, Workouts on their scheduled dates, exercises linked to
   `ExerciseLibrary` by `coachrx_id` (fallback: name match, else keep as text).
3. History → `WorkoutLog` (completed/missed) + `ExerciseLog.resultText` per exercise +
   comments. Exercises linked to the library by name (client rows carry no IDs).
4. `--program <id> --start <date>`: import a CoachRx template (exercise IDs + videos
   linked directly) and schedule it for a client — used for the new pilot blocks.
5. Dry-run mode that prints counts + unmatched exercises before writing.

Done when: re-running is a no-op, and the pilot client's calendar in WOD Coach matches
CoachRx workout-for-workout.

## Day 2-4: Client UX (mobile-first, the priority)

Keep it to four screens:
1. **Today** (`/client`): today's workout card with a big Start button, a 7-day strip
   (done / missed / upcoming), coach name. Nothing else.
2. **Workout** (`/client/workouts/[id]`): coach notes + warmup at top; each exercise
   shows video (tap to play), the prescription, a result text box (with last time's
   result shown as a hint), and an optional "+ sets" row editor; cooldown; Finish →
   optional note. Autosaves as they go so a dropped connection doesn't lose a session.
3. **History** (`/client/workouts`): completed workouts, newest first, tap to view.
4. **Profile** (`/client/profile`): name, goals, injuries, sign out.

Also: hide the Progress/Messages links until they exist, and add a PWA manifest + icon
so clients can "Add to Home Screen" (feels like an app, no App Store).

## Day 3-4: Coach essentials (needed for cutover)

1. **Invite flow:** "Invite" on a client → one-time link (reuse `VerificationToken`,
   7-day expiry) → `/auth/invite/[token]` set-password page → lands on Today.
2. **Client detail:** calendar of their program with completion status; tap a workout to
   see what they logged and their notes.
3. **Minimal program editor:** edit a workout (exercises, prescription, notes, warmup,
   cooldown), move it to another date, duplicate it, add a new one. No drag-and-drop
   week builder yet; the AI builder remains for creating whole programs.

## Day 5 (Fri): Rollout

1. Merge `test-login` (includes `sync-revival-2026-09`) + any other-device work into
   `master` → auto-deploys to coachrx-app.vercel.app.
2. Run importer for the pilot clients against production; spot-check each calendar.
3. Send invite links with a 3-line how-to (add to home screen, tap Start, log sets).
4. Ryan walks through one full workout as the demo client on his phone first.
5. Watch Vercel logs through the weekend; fix-forward.

## Explicitly not this week

Stripe subscriptions, messaging, progress charts, VBT, Loom, wearables, AI builder polish,
email notifications, full roster migration, two-way sync with CoachRx.

## Risks

- **Free-text results can't be charted.** Per-set logging is opt-in, so progress charts
  (not this week) will only have data where clients use "+ sets".
- **OpenTabs rate limits** (~15 calls then 30s wait): import runs slow but fine for 3 clients.
- **Other-device work** could conflict with client pages; push it early in the week.
- **Previews share the production DB**, so test data lands in prod. Consider a separate
  preview database before the full-roster rollout.
- **Google login on prod** needs the redirect URI registered; invite + password doesn't.
