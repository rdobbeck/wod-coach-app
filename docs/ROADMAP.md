# WOD Coach Roadmap (from Sep 21, 2026)

**Direction:** WOD Coach replaces CoachRx as the DTS coaching platform, as fast as possible.
Selling to other coaches (the March `MASTER_PLAN.md`) comes after it runs DTS end to end.

**Target:** clients training in the app from **Fri Sep 25**, everyone moved by **~Oct 4**,
CoachRx cancelled by **~Oct 31** (payments are the long pole, see Phase 3).

**Scale:** 14 active CoachRx clients (27 archived). Only 3 have programming scheduled
from Sep 21 on. So the migration is small; the work is in the product, not the data.

---

## What CoachRx does for DTS today → what replaces it

| CoachRx job | Replacement | Phase |
|---|---|---|
| Client app: see workout, videos, log results | Client screens (Today / Workout / History / Profile), PWA | 1 |
| Coach builds + edits programs | Coach editor + program templates + assign to client | 1-2 |
| Exercise library with videos | Already mirrored (4,542) → owned in-app, coach can add | 2 |
| Client moves workouts, sees exercise history | In the pilot build | 1 |
| Comments on workouts, messages | Per-workout comments + one coach↔client thread | 2 |
| Group/small-group programs (one program, many clients) | Template assigned to many clients, synced edits | 2 |
| Subscriptions + invoices ($25/wk design, $12/wk small-group) | Stripe subscriptions in-app | 3 |
| Public storefront (buy → auto-create client) | Program sales page → Stripe Checkout → auto account | 3 |
| Onboarding step (Typeform → CoachRx → InvoiceNinja → Calendly) | Typeform → WOD Coach invite → Stripe → Calendly | 3 |
| Lifestyle/habits, compliance %, wearables | Later (Phase 5); not needed to cancel | 5 |

---

## Phase 0 — Safety net (today → Tue Sep 22)

Take everything out of CoachRx once so it can be cancelled any time without losing data
(read-only GETs, already authorized):
- All 41 clients: profile + full workout history + comments (2024 → now)
- All program templates (`/programs.json` + each `/programs/<id>/workouts.json`)
- Saved as raw JSON under `backups/coachrx-export-YYYY-MM-DD/` and loaded into mirror
  tables, like `coachrx_exercises`, so the importer can work from the DB instead of the browser.

Done when: a full export exists and re-running it is a no-op.

## Phase 1 — Pilot (Sep 21 → Fri Sep 25)

Sasha Letchinger + Andrew Thresher go live. Details in `CLIENT_ROLLOUT_PLAN.md`:
schema, importer, client screens, move workouts, exercise history (weight/reps/RPE/text,
both sides), invite links, coach calendar + minimal editor.

## Phase 2 — Everyone on the app (Sep 28 → ~Oct 4)

Goal: all 14 active clients train in WOD Coach; nothing new gets built in CoachRx.
1. **Pilot fixes** from the first weekend of real use (first priority Monday).
2. **Coach editor, complete enough to stop using CoachRx:** build a workout from the
   library (search, add, reorder, supersets), copy last week forward, save as a template,
   **assign a template to a client with a start date**.
3. **Group programs:** one template assigned to many clients; editing the template updates
   everyone's future workouts (what CoachRx calls sync). Needed for the small-group programs.
4. **Comments + messages:** comment thread on each workout (imported CoachRx comments
   show here), plus one simple coach↔client message thread. Coach inbox of unread items.
5. **Notifications:** email the coach when a client finishes a workout or comments;
   optional "workout today" reminder to clients (push through the PWA, or email).
6. **Import + invite the remaining 12 active clients** (bulk importer run, bulk invites).
7. **Own the exercise library:** coach can add/edit exercises + video links in-app.
   Keep the nightly CoachRx sync running until cancellation, then switch it off.

## Phase 3 — Payments + storefront (Oct 5 → ~Oct 24)

Goal: money no longer flows through CoachRx.
1. **Research first (1 day):** is the Stripe account CoachRx charges through Ryan's own,
   i.e. a Standard Connect account? If yes, existing subscriptions and saved cards can
   move over without clients re-entering cards. If not, each paying client re-subscribes
   through a link. This decides how much of Phase 3 is building vs. asking clients.
2. **Products + plans in Stripe:** $25/wk program design, 4 × $12/wk small-group
   programs (Calisthenics, Handbalance, Hyrox, Oly), plus any 1:1 plans. The app already has
   Stripe keys and a webhook route (built for AI credits); extend it for subscriptions.
3. **Subscription ↔ access:** active subscription = program access; failed payment →
   grace period → access paused. Coach billing view (who pays, what, status).
4. **Sales pages:** one public page per small-group program → Stripe Checkout → account
   created + program assigned automatically (replaces the CoachRx storefront).
5. **Move the paying clients**, then **update every link:** ryandobbeck.com, Linktree/IG,
   Typeform confirmation, onboarding playbook (`~/Documents/dts-client-onboarding-playbook.md`).

## Phase 4 — Cancel CoachRx (~Oct 26 → Oct 31)

Checklist: final full export (Phase 0 script) → confirm zero active subscriptions and
zero clients left in CoachRx → switch off the 4am exercise sync (launchd) and the
OpenTabs dependency → cancel the CoachRx plan → keep the export in `backups/` for good.

## Phase 5 — After cancellation (Nov →)

Pick based on what clients ask for during Phases 1-3:
- Progress charts per exercise (from per-set logs + parsed text results), PR tracking
- Lifestyle/habits + compliance % (CoachRx had these; `HabitLog` table already exists)
- Wearables (`WearablesData` table exists; CoachRx used Terra)
- AI program builder brought up to date (drafts a block you then edit)
- VBT, Loom video feedback (already partly built)
- Then the SaaS direction in `MASTER_PLAN.md`: multi-coach, Stripe tiers, onboarding for
  other coaches

---

## Ongoing guardrails

- **Branches + previews:** work lands on a branch → Vercel preview (behind Vercel login,
  test login available) → merge to `master` auto-deploys to coachrx-app.vercel.app.
- **Separate preview database before Phase 2**, so testing stops writing to the real client DB.
- **Error monitoring before Phase 2** (e.g. Sentry free tier) so client-facing failures
  are seen, not reported by clients.
- **Backups:** Supabase free tier has no point-in-time restore; nightly `pg_dump` (or
  upgrade to Pro) before the full roster is on it.
- **Custom domain** (e.g. app.ryandobbeck.com) before storefront links go public.
- **Other-device work:** push it to GitHub early so it can be merged into the Phase 1 branch.
