# AI library builder: add exercises from YouTube links

Date: 2026-10-11. Status: draft for Ryan's review.

## Why

Adding an exercise to the library by hand means typing a name, pasting a
link, and leaving the pattern, equipment and cues empty. Ryan wants to hand
the app a YouTube link (or a list of them, or just an exercise name) and have
an AI fill in the entry the way these sessions do: read the video's title and
description, name the movement the way the library names things, tag its
pattern and equipment, write short cues, and flag when the library already
has it. Once an entry has a video, Ask AI's `link` action can attach it to any
session (shipped 2026-10-11).

## What changes, in one paragraph

An "Add with AI" panel on the library page takes YouTube links and exercise
names. For each, the server fetches the video's title, description, channel
and length from the YouTube Data API (or searches YouTube when only a name
was given), checks the library for a near-duplicate, and asks the assistant
model for a proposed entry: name, pattern tags, equipment, cues, one-line
description. The coach reviews the proposals in a list, edits anything
inline, unticks what they do not want, and saves. Saved entries are normal
library rows with a video, so they show on the library page, in the session
editor's picker, and to Ask AI. Model time is metered exactly like Ask AI.

## 1. Who gets it: owner first, then Pro and Studio

The library is one pool. Every coach sees the same 4,542 entries, and an
entry any coach adds today is visible to every other coach. `createdBy` is
written but never used in a filter. That is the real question behind "all
coaches or just me": not the cost of the feature, which is under a cent per
video, but whether other coaches' additions should land in the shared pool.

Decision: ship in two phases.

**Phase 1 (this spec): owner accounts only.** Gate on `ownerEmails()`, the
same check the billing admin routes use. Ryan gets the tool now against the
library that is, in practice, his. This also proves the YouTube quota, the
model's tagging quality, and the review flow on real use before anyone else
sees it.

**Phase 2 (separate spec, not built here): coaches on plans with the
assistant (Pro, Studio).** Three things must change first, and they are
library-wide, not part of this feature:

1. Coach-added entries become private to their creator: the library page, the
   picker search, Ask AI's matcher and suggestions all filter to
   `coachrxId != null OR createdBy = me`. Owner additions stay in the shared
   pool so the platform library keeps growing.
2. A per-coach daily limit on YouTube searches (searches cost 100 quota units;
   the free daily quota of 10,000 units is shared by the whole platform, so
   twenty searches per coach per day is the sensible ceiling).
3. The panel's spend copy and the 402 messages reuse Ask AI's, so a coach past
   their cap sees the same words they already know.

Nothing in phase 1 is built in a way that blocks phase 2: access is a single
check in one route, and every library write already stamps `createdBy`.

## 2. Inputs

The panel has one textarea. Each non-empty line is one request:

- A YouTube URL (watch, youtu.be, shorts, embed) is a **link request**.
- Anything else is a **name request**: the text is an exercise name to find a
  video for. Allowed only when `YOUTUBE_API_KEY` is set.
- A line like `90/90 Hip Lift https://youtu.be/...` is a link request with a
  name hint; the hint is passed to the model as the coach's preferred name.

Limits: up to 20 lines per ask; a line over 200 characters is rejected with a
plain message. Duplicate links within one ask are collapsed.

## 3. Fetching the video

`lib/library/youtube.ts`, with the fetcher injectable so tests never touch
the network:

- `videoDetails(ids)` calls `videos.list?part=snippet,contentDetails` (1 quota
  unit per call, up to 50 ids per call) and returns title, description
  (trimmed to 1,500 characters), channel title, duration in seconds, and the
  best thumbnail URL.
- `searchVideos(name)` calls `search.list?type=video&videoDuration=short&q=`
  with `name + " exercise"` (100 units) and returns the top 5 ids, then
  `videoDetails` on them. Candidates are ranked by: title contains the name's
  words, shorter duration, then YouTube's order. The top one is proposed; the
  other candidates are offered in the review row as alternatives.
- Without `YOUTUBE_API_KEY`: link requests fall back to YouTube's oEmbed
  endpoint (no key, title and channel only, no description); name requests
  are refused with "Set a YouTube API key to search by name."
- A 403 from YouTube with `quotaExceeded` becomes "YouTube's daily lookup
  limit is used up; try again after midnight Pacific." Other failures: "Could
  not read that video" against the line, and the rest of the batch continues.

No captions in this version. The official API serves captions only for
videos the key's owner uploaded, and unofficial transcript fetches are
blocked from Vercel's addresses. Title plus description plus the model's own
knowledge of the movement is enough for pattern, equipment and cues. If cues
from narration turn out to matter, a paid transcript API can be added behind
the same fetcher interface.

## 4. Duplicate check

Before the model runs, each request's title (and name hint) goes through the
existing `libraryMatcher()` plus `suggest()`. A match that has a video is a
**likely duplicate**; the review row shows "Looks like **Front Squat** (has a
video)" with a switch between "Add as new" and "Replace that entry's video".
Choosing replace reuses `PATCH /api/exercises/[id]` and touches nothing else
on the existing row.

## 5. The model call

One call per ask, `AI_ASSIST_MODEL` (Sonnet 5 by default), through the same
OpenRouter helper as Ask AI. Input per video: the coach's line, title,
channel, duration, description, the matcher's closest library names. The
prompt also carries the library's vocabulary so the model tags with the same
words the filters use:

- Patterns: the fixed list on the library page (`Push, Pull, Squat, Bend,
  Lunge, Core, Cyclical, Mobility, Stretch, Gymnastics, Plyometric,
  Weightlifting, Carry, Run`). One or two per exercise.
- Equipment: the 30 most used values in the library, fetched once and cached
  with the matcher (`Barbell, Bodyweight, Dumbbell, Cable, Kettlebell, Rings,
  Band, ...`). New words allowed only when none fits; the parser keeps them
  but flags the row.

Output, JSON only:

```json
{
  "entries": [
    {
      "line": 1,
      "name": "90-90 Hip Lift",
      "patterns": ["Core", "Mobility"],
      "equipment": ["Bodyweight"],
      "cues": "Feet on the wall, hips lifted an inch. Exhale fully, feel the left hamstring. 2x5 breaths.",
      "summary": "PRI reset for an anterior pelvic tilt pattern.",
      "confidence": "high"
    }
  ],
  "warnings": ["Line 3 looks like a workout vlog, not a demo; check it before saving."]
}
```

Parsing (`lib/library/propose.ts`, pure, tested without a model): unknown
line numbers dropped; name cleaned with `noLongDashes`, 120 characters;
patterns filtered to the fixed list; equipment trimmed to 40 characters each,
at most 4; cues 600 characters; summary 200; confidence one of
low/medium/high, default medium. Anything missing a name is dropped and
reported. The library's `category` and `difficulty` columns are not used by
anything (every row reads "Uncategorized" and "Unknown"); the parser leaves
them at the values the manual add route writes.

## 6. Review panel

`components/coach/LibraryAiPanel.tsx`, a slide-over on the library page next
to "New exercise", styled like the Ask AI panel. Owner accounts only see the
button.

- Textarea, "Propose" button, the spend meter line from Ask AI.
- While working: "Reading 6 videos…" then "Thinking…".
- Result: one row per entry with thumbnail, duration, channel; editable name;
  pattern chips (tap to toggle, from the fixed list); equipment chips with an
  "add" field; cues textarea; the duplicate switch when one was found; a
  "Try another video" menu for name requests with alternatives; a checkbox.
  Low-confidence rows start unticked with a note.
- Warnings in the same amber "Worth a look" box Ask AI uses; dropped lines
  under "Left out".
- "Save N exercises" writes the ticked rows. Success: toast, panel closes,
  page navigates to `/coach/library?q=<first saved name>` and refreshes.
  Partial failure: the failed rows stay in the panel with the error beside
  them; the rest are saved.

The proposal lives only in component state. A reload drops it; that is fine
for a tool the coach uses in one sitting, and avoids another saved-thread
table.

## 7. Routes

- `POST /api/library/ai/propose` body `{ lines: string[] }`. Owner check,
  then the same funding decision as Ask AI (plan with assistant and under the
  cap: allowance; else balance of at least `ASSIST_MIN_CENTS`; else 402 with
  Ask AI's wording). Fetches videos, runs the duplicate check, calls the
  model, settles the cost with `settleAiCall(..., { kind: "library" })`
  (`AiUsage.kind` gains the value `library` and `library_paid`; it is a plain
  string column, so no migration). Returns `{ entries, warnings, dropped,
  meter }`.
- `POST /api/library/ai/save` body `{ entries: [{ name, videoUrl,
  thumbnailUrl, patterns, equipment, cues, summary, replaceId? }] }`. Owner
  check. Each entry is validated again server-side with the same parser
  rules. Without `replaceId`: creates an `ExerciseLibrary` row with
  `category "Custom"`, `difficulty "Any"`, `muscleGroups = patterns`,
  `equipment`, `instructions = cues`, `description = summary`, `videoUrl`,
  `thumbnailUrl`, `isCustom true`, `createdBy`, `locked true`. With
  `replaceId`: updates only `videoUrl`, `thumbnailUrl` and `locked` on that
  row. Calls `invalidateLibraryMatcher()` once at the end. Returns
  `{ saved: [{ id, name }], failed: [{ name, error }] }`.

No schema change, so no `add-*.ts` script before deploy.

## 8. Cost and limits

- Model: about 1,500 input and 300 output tokens per video on Sonnet, so
  roughly half a cent each, under a dollar for a hundred videos. Metered on
  the same monthly cap and meter as Ask AI.
- YouTube: free. A link ask costs 1 quota unit for the whole batch; a name
  ask costs 100 per name. The daily free quota allows about 100 name searches
  a day. Phase 1 caps name requests at 20 per ask and 60 per day per account,
  counted from `AiUsage` rows of kind `library` with a `tokensIn` of 0 and a
  note in `model` of `youtube-search`, so no new table.
- Batch: 20 lines per ask, 110 second route timeout like Ask AI.

## 9. Errors

Every failure is per line where possible: a bad URL, a private or deleted
video, an unreadable one. The batch continues and the line shows under "Left
out" with the reason. Whole-ask failures (no key, quota, model down, funding)
return one plain sentence and nothing is charged except a model call that
actually ran.

## 10. Testing

- `tests/library-ai.spec.ts`, following `ai-assist.spec.ts`: no test calls
  YouTube or a model.
- Unit: URL parsing for the four YouTube forms and name lines; the parser's
  vocabulary enforcement and drops; duplicate detection against a seeded
  entry; candidate ranking for a name search.
- Route: `propose` with an injected fake fetcher and a mocked model reply
  (the route reads the fetcher from a module-level setter the test can swap,
  as the spend tests do with the cap); owner gate (a non-owner coach gets
  401); funding 402 at the cap.
- Route: `save` creates rows with the right fields, replaces only the video
  on `replaceId`, rejects a non-http link, and the new entry then resolves
  through `libraryMatcher()` on the next call.
- Panel: with `/api/library/ai/propose` mocked, review a two-row proposal,
  untick one, edit a name, save; the library page then shows the saved card
  with its thumbnail.

## 11. Files

- `lib/library/youtube.ts`: Data API and oEmbed fetchers, URL parsing, candidate ranking.
- `lib/library/propose.ts`: prompt rendering, vocabulary, parser.
- `app/api/library/ai/propose/route.ts`, `app/api/library/ai/save/route.ts`.
- `components/coach/LibraryAiPanel.tsx`; a button in `app/coach/library/page.tsx`.
- `lib/ai-billing.ts`: `kind` union gains `library`.
- `.env.local` and Vercel: `YOUTUBE_API_KEY`.

## 12. What Ryan decides

1. Owner-only first (recommended above), or straight to Pro and Studio with
   the three library-wide changes folded in.
2. A YouTube Data API key from Google Cloud (about five minutes: create a
   project, enable "YouTube Data API v3", create an API key, restrict it to
   that API). Without it, link asks still work with title only and name asks
   are off.
3. Whether low-confidence rows should start unticked (proposed) or ticked.
