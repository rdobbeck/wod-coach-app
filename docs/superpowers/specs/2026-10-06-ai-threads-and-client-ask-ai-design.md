# Ask AI: saved threads and client access

Date: 2026-10-06. Status: approved in conversation, pending written review.

## Why

Today the Ask AI panel keeps its conversation and proposed edits only in the
browser's memory. A reload, a navigation, or a crash loses them before the
coach can apply. Ryan also wants clients to be able to use Ask AI on their
own training, with the coach keeping control through a per-client switch and
an undo.

## What changes, in one paragraph

Every Ask AI conversation is saved to a new `AiThread` table and restored when
the panel opens. A new `canAskAi` switch on each client, off by default, lets
that client use the same panel on their Today page; their calls spend from
their coach's allowance under the same cap. Edits a client applies land
directly and are recorded with who applied them. The coach gets a push and a
"Recent AI changes" strip on the client's coach page with Undo.

## 1. Saved threads

### Data

```prisma
model AiThread {
  id        String   @id @default(cuid())
  userId    String   // who is chatting: the coach or the client
  clientId  String   // whose training it is about
  messages  Json     // Msg[] exactly as the panel keeps them
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, clientId])
}
```

`messages` is the panel's existing `Msg[]` (role, text, changes, warnings,
dropped, picked, state, changeSetId, undone, applyNote). `failed` messages are
not saved. The list is trimmed to the last 20 entries on every save.

### Routes

- `GET /api/ai/assist/thread?clientId=` returns `{ messages }` or `{ messages: [] }`.
- `PUT /api/ai/assist/thread` body `{ clientId, messages }` upserts; messages
  are validated with the same shape checks as the apply route uses for a
  `Change` (array, bounded sizes, only known fields kept).
- `DELETE /api/ai/assist/thread?clientId=` removes the row.

All three use the shared access check in section 2.

### Panel behaviour

- On open, load the thread before showing the empty-state examples. A short
  "Loading…" line covers the fetch.
- Save after each of: reply received, apply finished, discard, undo, clear.
  Saves are fire-and-forget; a failed save shows a one-line toast and the
  panel keeps working.
- "Clear" link in the header next to "Close": deletes the thread and empties
  the panel. Pending proposals in a cleared thread are gone, so the link asks
  "Clear this conversation? Unapplied edits will be dropped." first.
- Pending proposals restored from a thread are applied through the existing
  apply route, which re-checks every change against the database, so stale
  proposals are skipped and reported the way they are today.

## 2. Client access

### Data

`ClientProfile.canAskAi Boolean @default(false)`.

### Switch

`components/coach/ClientActions.tsx` gains "Client can ask AI" beside "Client
can move workouts", saved through the existing
`PATCH /api/clients/[clientId]/settings` route, which accepts `canAskAi`.
The switch is only shown when the coach's plan includes the assistant, with
a note "Spends from your AI allowance" under it.

### Access check

New helper `lib/ai/access.ts`:

```ts
/** Who may use Ask AI about `clientId`, and whose allowance pays. */
export async function aiAccess(clientId: string): Promise<
  | { viewer: "coach"; userId: string; coachId: string }
  | { viewer: "client"; userId: string; coachId: string }
  | null
>
```

- A coach of the client (existing `coachOf`) gets `viewer: "coach"`, paying
  themselves.
- The client themselves gets `viewer: "client"` when `canAskAi` is true and
  they have an active coach link. `coachId` is their active coach (first by
  `startDate`); that coach's plan, cap and balance fund the call.
- Anyone else: null → 401 (403 for a client with the switch off, so the UI
  can explain).

`/api/ai/assist`, `/apply`, `/undo` and the new `/thread` routes switch from
`coachOf` to `aiAccess`. Spend accounting (`settleAiCall`, `spendMeter`,
`assertUnderCap`) keys on `coachId` from the access result, unchanged
otherwise.

### Client panel

`AiAssistant` gets a `viewer: "coach" | "client"` prop.

- Client copy: title "Ask AI", subtitle "About your training. Nothing changes
  until you apply it."; examples rewritten in first person ("My shoulder is
  irritated. No overhead work for two weeks."); apply note "Applied 2 changes
  to your calendar."
- The spend meter is hidden for clients (it is the coach's money). A capped
  month disables the box with "Your coach's AI limit is used up for this
  month."
- The "Apply load bumps automatically" switch is shown to clients too and
  stored under the same localStorage key.
- Rendered from `app/client/page.tsx` when `profile.canAskAi` is true, below
  the Today view, same floating button.

### What a client may change

Exactly what the coach may: upcoming, not completed sessions; exercises with
no logged sets. No new rules. The model prompt is unchanged.

## 3. Coach visibility and undo

### Data

`AiChangeSet.appliedById String?` (null for existing rows, which were all
coach-applied). Written on every apply.

### Push

After a client applies, `notifyUser(coachId, { title: "<First> changed their
training with AI", body: "<n> edits: <request, first 80 chars>", url:
"/coach/clients/<id>" })`. Coaches register push devices the same way clients
do today; if a coach has none, the push is a no-op and the strip below still
shows the change.

### Strip

On the coach's client page, above the calendar: "Recent AI changes", the
last five `AiChangeSet` rows for this client, newest first, each with: when,
who ("you" or the client's first name), the request text, "n edits", and an
Undo button (hidden once undone, replaced by "Undone"). Undo posts to the
existing `/api/ai/assist/undo`.

### Undo permission

`undoChangeSet` currently requires `coachId` to match. It changes to: the
caller is a coach of the client on the set, or the caller is `appliedById`.

## 4. Deploy, migration, tests

### Deploy guard

The build fails if production lacks a column the schema reads. Before pushing
to master:

1. `scripts/create-ai-thread.ts`: creates `AiThread` and its unique index,
   adds `ClientProfile.canAskAi` and `AiChangeSet.appliedById`. Idempotent
   (`IF NOT EXISTS`). Run against `preview` for local tests, then `public`.
2. Then push.

### Tests (Playwright, `tests/ai-assist.spec.ts` and a new
`tests/ai-client.spec.ts`)

- Thread: send a mocked request, reload, the proposal is still there and
  still applies; discard persists; Clear empties it.
- Access: client with the switch off gets 403 on `/api/ai/assist` and sees
  no button; with it on, sees the button, gets a (mocked) reply, applies, the
  change set has `appliedById` = client and the coach's spend meter rises by
  the mocked cost.
- Coach strip: after the client apply, the coach page lists the batch with
  the client's name and Undo restores the exercise.
- Undo permission: another client cannot undo it (404).

### Out of scope

Approval-required mode for client edits, per-client spend limits, email or
SMS notification of client edits, and showing a client's pending drafts to
the coach. Each is a follow-up if wanted.
