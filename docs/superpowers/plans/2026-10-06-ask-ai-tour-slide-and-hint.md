# Ask AI Tour Slide and First-Use Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients whose coach switched on Ask AI learn what the red button does: new clients from a conditional tour slide, existing clients from a one-time hint card on Today that goes away after their first message.

**Architecture:** The tour's step builder (`buildSteps` in `components/client/Tour.tsx`) already adds slides conditionally (`canBook`, `canMove`); a `canAskAi` flag adds one more, with a visual in `components/client/TourVisuals.tsx`. The Today page already renders the client-mode `AiAssistant` when `profile.canAskAi` is true; the existing one-time `Hint` component (`components/client/Hint.tsx`, remembered per device in localStorage) is rendered beside it and auto-dismisses when the panel reports the first message was sent, via a new optional `onFirstMessage` prop on `AiAssistant`.

**Tech Stack:** Next.js 14 app router, React 18, Tailwind, Playwright e2e against a local dev server (`PW_PORT=3012`), Prisma on Supabase (`preview` schema for tests).

**Design decisions (approved in conversation 2026-10-06):** hint is the existing Hint card at the bottom of Today, not a callout on the button; copy angle is "freedom with a safety net" (what to say, nothing changes until Apply, the coach sees and can undo). No spec file: bounded change to existing flows.

## Global Constraints

- No em dashes or en dashes anywhere in copy or comments.
- Work in a worktree off `origin/master`; run tests with `PW_PORT=3012 npx playwright test <file> --reporter=list` (port 3011 is held by another checkout's dev server). Copy `.env.local` into the worktree and symlink `node_modules` from `~/wod-coach-app`.
- Commit after every task with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: <this session's URL>
  ```
- The tour was rewritten on 2026-10-06 by another session (slides: tabs, logging, rest, video, calls?, move?, notifications, install?). Touch only `buildSteps` and `TourVisuals.tsx`; do not reorder or reword other slides.
- Coach name: use the `coachName` prop already passed to `buildSteps`, falling back to "your coach". Do not hard-code "Ryan".

## Review Focus

1. A client whose switch is on but whose coach has no upcoming sessions for them: the slide and hint still show (they describe the feature, not today's data). No test needed; confirm by reading.
2. A client who already has a saved thread (used Ask AI before this shipped): the hint should not appear. Covered in Task 2 via `onFirstMessage` firing on thread restore with messages.
3. Switch turned off after the hint was dismissed: nothing renders. Covered in Task 2.
4. Reduced motion: the slide visual must be static, not animated. Use plain markup, no new keyframes.
5. The hint and the floating button must not overlap the bottom nav on a 375px-wide phone. Visual check in Task 3.

---

### Task 1: Conditional tour slide

**Files:**
- Modify: `components/client/Tour.tsx` (`buildSteps` args and the `Tour` component props, ~lines 36-50 and 171-190 and 269)
- Modify: `components/client/TourVisuals.tsx` (new `AskAiVisual`)
- Modify: `app/client/page.tsx` (`<Tour ... canAskAi={...} />`, ~line 130)
- Test: `tests/tour.spec.ts`

**Interfaces:**
- Produces: `Tour` props gain `canAskAi: boolean`; `buildSteps` gains `canAskAi: boolean`; `AskAiVisual()` exported from TourVisuals.

- [ ] **Step 1: Write the failing tests**

In `tests/tour.spec.ts`, after the existing walkthrough test, add:

```ts
test("the Ask AI slide appears only when the coach switched Ask AI on", async ({ browser }) => {
  test.setTimeout(90_000)
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  const walk = async () => {
    await unseen()
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    await signIn(page)
    const tour = page.getByRole("dialog", { name: "App walkthrough" })
    await expect(tour).toBeVisible()
    const titles: string[] = []
    for (let i = 0; i < 12; i++) {
      titles.push((await tour.getByRole("heading").textContent()) ?? "")
      const next = tour.getByRole("button", { name: "Next" })
      if (!(await next.isVisible())) break
      await next.click()
    }
    await ctx.close()
    return titles
  }
  await prisma.clientProfile.update({ where: { userId: client.id }, data: { canAskAi: true } })
  const withAi = await walk()
  expect(withAi).toContain("Ask the AI about your training")
  // It sits after the week slide (when present) and before notifications.
  expect(withAi.indexOf("Ask the AI about your training")).toBeLessThan(withAi.indexOf("Turn on notifications"))

  await prisma.clientProfile.update({ where: { userId: client.id }, data: { canAskAi: false } })
  const withoutAi = await walk()
  expect(withoutAi).not.toContain("Ask the AI about your training")
})
```

Check how `unseen()` and `signIn()` are defined at the top of the file and reuse them as they are. Make sure `afterAll` leaves `canAskAi` false.

- [ ] **Step 2: Run to verify it fails**

Run: `PW_PORT=3012 npx playwright test tests/tour.spec.ts -g "Ask AI slide" --reporter=list`
Expected: FAIL, `withAi` does not contain the title.

- [ ] **Step 3: Add the visual**

In `components/client/TourVisuals.tsx`, after `WeekVisual`:

```tsx
/** The red Ask AI button and one proposed change under it, as the client sees them. */
export function AskAiVisual() {
  return (
    <Frame className="space-y-2 bg-app-surface">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-app-text px-3 py-2 text-xs text-app-bg">
        My shoulder is irritated. No overhead work for two weeks.
      </div>
      <div className="rounded-xl border border-app-border bg-app-surface2 px-2.5 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-app-muted">Thu &middot; Upper</p>
        <p className="mt-1 text-xs text-app-text">
          <span className="mr-1.5 rounded bg-app-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-accent">replace</span>
          <span className="text-app-muted line-through">Strict Press</span> &rarr; <span className="font-semibold">Landmine Press</span>
        </p>
        <div className="mt-2 flex gap-2">
          <span className="flex h-8 flex-1 items-center justify-center rounded-lg bg-app-accent font-display text-xs font-bold uppercase tracking-wide text-white">Apply 1 change</span>
          <span className="flex h-8 items-center rounded-lg border border-app-border px-3 text-xs font-semibold text-app-muted">Discard</span>
        </div>
      </div>
      <div className="flex justify-end">
        <span className="flex items-center gap-1.5 rounded-full bg-app-accent px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.06em] text-white shadow">
          &#10022; Ask AI
        </span>
      </div>
    </Frame>
  )
}
```

If `bg-app-accent/15` does not render (theme colours are CSS variables; see the note in `RestTimer.tsx`), use `bg-[rgba(var(--app-accent-rgb),0.15)]`.

- [ ] **Step 4: Add the slide**

In `components/client/Tour.tsx`:
- Import `AskAiVisual` alongside the other visuals.
- Add `canAskAi: boolean` to the `buildSteps` argument type and destructuring, and to the `Tour` component props and its call to `buildSteps`.
- After the `if (canMove) { ... }` block and before the notifications step is pushed:

```tsx
  if (canAskAi) {
    steps.push({
      id: "askai",
      title: "Ask the AI about your training",
      icon: <Icon><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /></Icon>,
      visual: <AskAiVisual />,
      body: (
        <p>
          Tell it what&apos;s going on. A cranky shoulder, a week with only dumbbells, squats that felt easy. It reshapes your upcoming
          sessions. Nothing changes until you tap <span className="font-semibold text-app-text">Apply</span>, and{" "}
          {coachName || "your coach"} sees every change and can undo it.
        </p>
      ),
    })
  }
```

- [ ] **Step 5: Pass the flag from Today**

In `app/client/page.tsx`, the `<Tour ... />` call gains `canAskAi={!!profile?.canAskAi}`.

- [ ] **Step 6: Run the tour tests and typecheck**

Run: `PW_PORT=3012 npx playwright test tests/tour.spec.ts --reporter=list && npx tsc --noEmit`
Expected: all tour tests pass; no tsc output.

- [ ] **Step 7: Commit**

```bash
git add components/client/Tour.tsx components/client/TourVisuals.tsx app/client/page.tsx tests/tour.spec.ts
git commit -m "Tour: an Ask AI slide for clients whose coach switched it on"
```

---

### Task 2: First-use hint on Today

**Files:**
- Modify: `components/coach/AiAssistant.tsx` (new optional prop `onFirstMessage?: () => void`)
- Modify: `app/client/page.tsx` (render `Hint` beside `AiAssistant`; needs a small client wrapper since the page is a server component)
- Create: `components/client/AskAiHint.tsx`
- Test: `tests/ai-client.spec.ts`

**Interfaces:**
- Produces: `AiAssistant` calls `onFirstMessage()` once, either when a restored thread already has messages or when the first reply lands. `AskAiHint({ clientId, clientName, meter })` renders the Hint card plus the panel.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai-client.spec.ts`:

```ts
test("the Ask AI hint shows once, and goes away after the first message or when the switch is off", async ({ page }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  await prisma.aiThread.deleteMany({ where: { clientId } })
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({ json: { reply: "32 sessions left.", changes: [], warnings: [], dropped: [], meter: { spent: 0.05, cap: 25, level: "ok" } } })
  })
  await signInAsClient(page)
  const hint = page.getByRole("note").filter({ hasText: /Ask AI/ })
  await expect(hint).toBeVisible()
  await page.getByRole("button", { name: /Ask AI about your training/ }).click()
  await page.getByPlaceholder("Ask a question or describe a change").fill("How many sessions are left?")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("32 sessions left.")).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await expect(hint).toBeHidden()
  // Still hidden after a reload: the thread now has messages.
  await page.reload()
  await expect(page.getByRole("button", { name: /Ask AI about your training/ })).toBeVisible()
  await expect(hint).toBeHidden()
  // Switch off: no hint, no button.
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  await page.reload()
  await expect(page.getByRole("button", { name: /Ask AI/ })).toBeHidden()
  await expect(hint).toBeHidden()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `PW_PORT=3012 npx playwright test tests/ai-client.spec.ts -g "hint shows once" --reporter=list`
Expected: FAIL, no `note` containing "Ask AI".

- [ ] **Step 3: Let the panel report the first message**

In `components/coach/AiAssistant.tsx`:
- Add `onFirstMessage?: () => void` to the props.
- Add `const announced = useRef(false)` and a helper:

```ts
  const announceFirst = () => {
    if (announced.current) return
    announced.current = true
    onFirstMessage?.()
  }
```

- In the thread-load `.then`, after `setMsgs(...)`, call `if (d.messages.length) announceFirst()`.
- In `send`, right after the assistant reply is appended with `setMsgs`, call `announceFirst()`.

- [ ] **Step 4: The hint wrapper**

`components/client/AskAiHint.tsx`:

```tsx
'use client'

import { useState } from "react"
import AiAssistant from "@/components/coach/AiAssistant"
import Hint from "@/components/client/Hint"

type Meter = { spent: number; cap: number; level: "ok" | "warn" | "capped" }

/** The client's Ask AI button plus a one-time card explaining it, gone after their first message. */
export default function AskAiHint({ clientId, clientName, coachName, meter }: { clientId: string; clientName: string; coachName: string | null; meter: Meter }) {
  const [used, setUsed] = useState(false)
  return (
    <>
      <div className="mt-4">
        <Hint id="ask-ai" done={used}>
          New: the red <span className="font-semibold">Ask AI</span> button. Tell it what&apos;s going on and it reshapes your upcoming sessions. Nothing
          changes until you tap Apply, and {coachName ?? "your coach"} can undo anything.
        </Hint>
      </div>
      <AiAssistant clientId={clientId} clientName={clientName} meter={meter} viewer="client" onFirstMessage={() => setUsed(true)} />
    </>
  )
}
```

- [ ] **Step 5: Use it on Today**

In `app/client/page.tsx`, replace the `{aiMeter && <AiAssistant ... viewer="client" />}` line with:

```tsx
      {aiMeter && <AskAiHint clientId={session.user.id} clientName={session.user.name ?? ""} coachName={coachLink?.coach.name ?? null} meter={aiMeter} />}
```

and swap the `AiAssistant` import for `AskAiHint`. The card renders inside `<main>`, under the Today content, above the bottom nav padding.

- [ ] **Step 6: Run the client AI tests and typecheck**

Run: `PW_PORT=3012 npx playwright test tests/ai-client.spec.ts --reporter=list && npx tsc --noEmit`
Expected: all pass; no tsc output.

- [ ] **Step 7: Commit**

```bash
git add components/coach/AiAssistant.tsx components/client/AskAiHint.tsx app/client/page.tsx tests/ai-client.spec.ts
git commit -m "Today: a one-time hint explains the Ask AI button; gone after the first message"
```

---

### Task 3: Visual check, suite, merge, deploy

- [ ] **Step 1: Look at it on a phone width**

With the dev server running, open `http://localhost:3012/client` signed in as the test client (switch on) in a 375px-wide viewport (Playwright `page.setViewportSize({ width: 375, height: 812 })` in a throwaway script, or Chrome device mode). Confirm the hint card and the red button do not cover the bottom nav and the slide visual is legible. Adjust spacing only if needed.

- [ ] **Step 2: Full suite**

Run: `PW_PORT=3012 npx playwright test --reporter=list 2>&1 | tail -20`
Expected: everything passes.

- [ ] **Step 3: Merge and push**

The main checkout holds `master`, so merge on a temporary branch:

```bash
git fetch origin
git checkout -b release-tour origin/master
git merge --no-ff <feature-branch> -m "Merge <feature-branch>: Ask AI tour slide and first-use hint"
git push origin release-tour:master
git checkout <feature-branch> && git branch -D release-tour
```

Watch `gh api repos/rdobbeck/wod-coach-app/commits/$(git rev-parse origin/master)/status` until Vercel reports `success`. No schema change, so no migration step.

- [ ] **Step 4: Verify live**

On wod.coach as the coach, switch "Client can ask AI" on for the Test Install client, open a fresh client session for it (invite link, or the existing dobbecktraining+wodtest sign-in) and confirm the hint card shows on Today. Switch it back off afterwards. Remove the worktree and the merged branch.
