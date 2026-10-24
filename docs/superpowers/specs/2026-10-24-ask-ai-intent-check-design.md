# Ask AI: intent check, confirm step, and the "Nothing to change" bug

Date: 2026-10-24. Branch `feat/ask-ai-intent-check`, worktree `~/wod-coach-ask-ai`.

## Why

Ryan's complaint: Ask AI "isn't very attentive to the correct action" and only works when the ask is very specific. The concrete case, from production on 2026-10-24 (client Murray A, typed by Murray himself in the client app):

> "I'm going swimming today. Can I have a 20-minute workout or swim?" → "Nothing to change."
> "Add a swim workout for today as a fresh workout. Keep it 20 minutes long" → "Nothing to change."

The second ask is perfectly clear. The cause is a bug, not wording: Murray has more than four upcoming sessions, so `splitContext` asks the model in parts of four. Today (Oct 24) had no session, so no part held it. Every part was told "if the request is about sessions you do not hold, return an empty reply", later parts may not `create`, and `mergeProposals` fell back to the bare text "Nothing to change."

So the work is, in order:

1. Fix the bug, so clear asks about empty days or new sessions work.
2. Add a cheap pre-check with Jev (`typesafe/jev-1.13` on OpenRouter's Decisions API) that spots vague asks, and only then shows a "here's what I understood" card for a yes before the expensive model runs.
3. Add a cheap post-check with Jev that catches proposals that don't do what was asked, and retries once instead of shrugging.
4. Log Jev's intent label per ask, so a later decision about routing questions to a faster model is made from data.

## Goals

- A clear ask about a day with no session ("add a 20 min swim today") produces a `create` proposal, for any program length.
- Ask AI never replies with a bare "Nothing to change." It either does something, asks one specific question, or says why it did nothing.
- Vague asks ("make it better", "harder", "her shoulder is cranky") get a one-sentence restatement card with **Yes, do it** and **Not quite** before Sonnet runs.
- Clear asks and plain questions are not slowed by a confirm step. The pre-check adds about 150 ms.
- Each user ask in the saved thread records Jev's intent label and scores.

## Non-goals

- Model routing (sending some asks to a cheaper or stronger model). Decided against for now; see "Later".
- Jev Router. It picks models itself, which breaks the per-model price table the coach's AI allowance is charged from.
- Rewriting the main Sonnet prompt beyond the part-ownership fix.
- Changes to apply, undo, auto-apply of load bumps, or the thread storage format beyond new optional fields.

## Anti-goals (a failure even if it technically works)

- A confirm card on every message. Clients use this on their phones; every proposal already waits for Apply.
- Ask AI going down, or blocking, because Jev or the restating model is down. Both checks fail open: on any error the ask proceeds exactly as today.
- A coach or client being charged a visible extra cent per ask for Jev. Jev costs about $0.00003 per call; it is folded into the ask's own cost, never settled as its own row (`chargeCents` rounds up to whole cents, so a separate row would bill 1 cent per check).
- Restatements that invent things the person didn't say (a different date, a different exercise).

## Design

### 1. The bug: who owns asks about days no part holds

`lib/ai/assist.ts` `renderContext` part instructions change:

- **Part 1** additionally owns any request about a date that has no session in the whole program, any request for a new session, and any request it cannot place in another part's session list. It may `create`, as today.
- **Other parts** keep "if the request is about sessions you do not hold, return an empty reply". Unchanged: they may not `create`.

`mergeProposals` and `parseProposal` no longer produce the bare "Nothing to change." When there are no changes, no warnings and no reply text, the route returns a plain explanation instead, e.g. "I didn't find anything to change for that. If you want a new session, say the day, like 'add a 20 min swim today'." (Exact copy is the builder's call; first-person variant for the client viewer.)

Existing unit tests for split and merge stay green. New unit test: an empty-day create request rendered for part 1 includes the ownership line; parts 2+ do not.

### 2. Jev client

New `lib/ai/decide.ts`:

- `askJev(state, questions)` POSTs to `https://openrouter.ai/api/alpha/decisions` with `OPENROUTER_API_KEY`, model from `AI_CHECK_MODEL` (default `typesafe/jev-1.13`), a short timeout (about 3 s). Returns answers plus `usage.cost`. Throws on non-2xx, a missing answer, or an out-of-range probability (pattern from OpenRouter's "Gate Agent Tool Calls with Jev" cookbook).
- Verified live on Ryan's key on 2026-10-24: ~150 ms, ~$0.000028 per call, `noul` and `choice` both work.

### 3. Pre-check (before Sonnet)

In `app/api/ai/assist/route.ts`, after funding and before `buildContext`'s model calls, one Jev request with:

- **state:** today's date, the editable session list as one line per session (weekday, date, name; no client names), the last two turns of history (so "yes, move it to tomorrow" is read in context), and the message.
- **questions:**
  - `clear` (noul): the message says what to change, or asks a question, clearly enough that a programmer could act without guessing. Wording tuned on real asks (below).
  - `intent` (choice): `question` | `change_exercises` | `schedule` (move, create or cancel sessions) | `videos` | `unclear`.

Decision:

- `intent = question` with high probability: proceed, no card.
- `clear` at or above the threshold: proceed, no card.
- Otherwise: **confirm path**.
- Jev error or timeout: proceed (fail open), log it.
- The request body may carry `confirmed: true` (the person tapped Yes): skip the pre-check entirely.

**Threshold tuning (required before the gate is switched on).** The first live test scored "Her shoulder is irritated. No overhead work for the next two weeks." at only 0.25, though Sonnet handles it well. A small eval script (`scripts/eval-ai-check.ts`) runs a labelled list of asks (the ones from this doc, the panel's example prompts, and the user messages from preview threads) through the pre-check and prints scores, so the question wording and threshold can be set where clear asks pass and "make it better" / "harder" do not. Target: every panel example prompt and the Murray swim ask pass; "make it better", "harder", "fix it" do not. The chosen threshold lives in one constant.

### 4. The confirm card

When the confirm path is taken, the route calls a fast model (`AI_RESTATE_MODEL`, default `anthropic/claude-haiku-5.5`) with the same compact session list, today's date and the message, asking for **one sentence** restating the request as a concrete instruction ("Add a new 20-minute swim session today, Sat Oct 24."), using only what the person said plus dates resolved from the session list. If it genuinely cannot tell, it returns one short question instead. Restate failure falls back to proceeding as today.

The route returns `{ confirm: { kind: "restate" | "question", text }, check, meter }` instead of a proposal. Nothing is written. A `question` shows as a plain assistant reply with no buttons (the person just answers in the box); only a `restate` gets the buttons.

Panel (`components/coach/AiAssistant.tsx`): the assistant message shows the restated sentence with two buttons:

- **Yes, do it**: sends the restated sentence as the new user message with `confirmed: true`.
- **Not quite**: puts the restated sentence in the input box to edit, cursor at the end.

Copy is first person for the client viewer. The card is a normal saved message (new optional `Msg.confirm` field), so a reload keeps it; once answered, its buttons go away.

### 5. Post-check (after Sonnet)

For any ask whose intent is not `question`, after the proposal is merged, one Jev request: state = the message (or the confirmed restatement) and a plain-text list of the proposed changes (action, session date and name, exercise), question `matches` (noul): "the proposed changes carry out what the message asks."

- `matches` clearly low (threshold set with the same eval script) **and** the proposal has zero changes: retry Sonnet once, **part 1 only** (it now owns creates and unplaced asks), appending to the message: "Your previous answer made no changes. The request is a change; make it, or ask one specific question." Use the retry's proposal. Skip the retry if more than 50 s of the route's 120 s budget is already used; the person then gets the plain explanation from section 1.
- `matches` clearly low with some changes: no retry; add a warning ("These edits may not be what you asked for. Check before applying.") so it never auto-applies.
- Otherwise, or on Jev error: return the proposal as is.

### 6. Logging and billing

- The route returns `check: { intent, clear, matches? }`. The panel stores it on the user's message in the thread (new optional `Msg.check`). No database migration: threads are JSON.
- Billing keeps the current rule that each model call is settled as soon as it returns:
  - Pre-check Jev cost is added to the first part's `costUsd` before `settleAiCall`.
  - The confirm path (Jev + Haiku, no Sonnet) settles one normal `assist` row with their combined cost. In balance mode that can round up to 1 cent; that's acceptable, because it replaces a Sonnet call costing several cents.
  - The Sonnet retry is real money and settles as its own normal `assist` row, with the post-check Jev cost added to it.
  - With no retry, the post-check Jev cost (~$0.00003) is not billed.
- `lib/ai/thread.ts` `sanitizeMessages` keeps only fields it knows, so it gains `confirm` and `check`. It also currently drops `create`, `move`, `delete` and `link` changes, so a saved proposal like Murray's swim session would vanish on reload; it is widened to keep every action `Change` has (including `exercises`, `newDate`, `position`).
- Kill switch: env `AI_CHECKS=off` skips both Jev checks and the confirm path, so behaviour returns to exactly today's minus the bug.

## Constraints

- No schema change, so the deploy guard and prod DDL are not involved.
- Another session pushes to master: work stays on the branch/worktree; `git fetch` before merging.
- Commits as rdobbeck / ryandobbeck@gmail.com.
- No em or en dashes in any user-facing copy (`noLongDashes`).

## Tests

- Unit (Playwright pure tests in `tests/ai-assist.spec.ts`, matching current style): part-ownership rendering; no bare "Nothing to change"; pre-check decision logic with injected Jev answers (question, clear, vague, error); post-check retry/warning logic.
- Panel e2e with mocked `/api/ai/assist`: confirm card renders, **Yes** resends with `confirmed: true` and shows the proposal, **Not quite** fills the box, card survives reload.
- Live, manual, once: the eval script against Jev, and Murray's exact swim ask against preview with a seeded long program, showing a `create` proposal.

## Calls I made (Ryan to check)

- Confirm card only on vague asks, not every ask.
- Button labels "Yes, do it" / "Not quite".
- Post-check retries at most once, and only when there were zero changes.
- Restating model is Haiku 5.5; Jev model is 1.13 (the one Ryan linked; 1.14 exists and can be switched via `AI_CHECK_MODEL`).
- Both checks fail open.
- Intent logged in the thread JSON, not a new table.
- Billing as in section 6 (confirm path and retry are normal rows; post-check without a retry is free).
- Retry is part 1 only, skipped past 50 s.
- The gate ships switched on once the eval script passes its targets, with `AI_CHECKS=off` as the kill switch. Claude runs the eval against live Jev and the preview database (not production).
- `sanitizeMessages` is widened to keep every change action. This is an existing bug, fixed because Murray's swim proposal would otherwise disappear on reload.

## Later (not in this build)

Routing by intent: once a month of `check.intent` data exists, consider sending `question` asks to a faster model (speed, not money), and big rewrites to a stronger one.
