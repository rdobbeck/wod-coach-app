import type { Context, Turn, Change } from "@/lib/ai/assist"
import type { Question } from "@/lib/ai/decide"

export type Intent = "question" | "change_exercises" | "schedule" | "videos" | "unclear"

export const checksOn = () => process.env.AI_CHECKS !== "off"

// Thresholds on Jev's probabilities. Task 5 (eval) sets the final values.
export const CLEAR_AT = 0.5
export const QUESTION_AT = 0.8
export const MISMATCH_AT = 0.2

export const MISMATCH_WARNING = "These edits may not be what you asked for. Check before applying."

export const PRE_QUESTIONS: { clear: Question; intent: Question } = {
  clear: {
    type: "noul",
    instructions:
      "`message`, read together with `recent_turns`, says what to change in the client's training (which day or sessions, and what change), or asks a question, clearly enough that a strength coach could act on it without guessing.",
  },
  intent: {
    type: "choice",
    instructions: "What does the coach want from `message`, read together with `recent_turns`?",
    criteria: {
      question: "A question to answer, nothing changed",
      change_exercises: "Swap, remove, add or adjust exercises or prescriptions",
      schedule: "Move, create or cancel whole sessions",
      videos: "Attach or fix demo videos",
      unclear: "Not possible to tell what is wanted",
    },
  },
}

export const POST_QUESTIONS: { matches: Question } = {
  matches: {
    type: "noul",
    instructions:
      "The changes in `proposed_changes` carry out what `message` asks for. Zero changes does not carry out a request to change something.",
  },
}

const weekday = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })

/** What Jev sees before the main call: the calendar and the talk, never exercises or client details. */
export function preState(ctx: Context, message: string, history: Turn[]) {
  return {
    today: ctx.today,
    sessions: ctx.sessions.map((s) => `${weekday(s.date)} ${s.date}  ${s.name}`).join("\n"),
    recent_turns: history.slice(-2).map((t) => `${t.role}: ${t.content.slice(0, 300)}`).join("\n"),
    message,
  }
}

/** One plain line per proposed change, for the post-check. */
export function changeLines(changes: Change[]): string {
  return changes
    .map((c) => {
      const day = `${weekday(c.date)} ${c.date}`
      switch (c.action) {
        case "create":
          return `create ${day} "${c.workoutName}" (${(c.exercises ?? []).map((e) => e.name).join(", ")})`
        case "replace":
          return `replace ${day} ${c.workoutName}: ${c.exercise} -> ${c.newExercise}`
        case "modify":
          return `modify ${day} ${c.workoutName}: ${c.exercise} ${c.currentPrescription ?? ""} -> ${c.newPrescription ?? ""}`.replace(/\s+/g, " ")
        case "remove":
          return `remove ${day} ${c.workoutName}: ${c.exercise}`
        case "add":
          return `add ${day} ${c.workoutName}: ${c.newExercise}${c.newPrescription ? ` ${c.newPrescription}` : ""}`
        case "link":
          return `link ${day} ${c.workoutName}: ${c.exercise ?? c.newExercise} video`
        case "move":
          return `move ${day} ${c.workoutName} -> ${c.newDate ? `${weekday(c.newDate)} ${c.newDate}` : ""}`.trim()
        case "delete":
          return `delete ${day} ${c.workoutName}`
      }
    })
    .join("\n")
}

export type PreCheck = { intent: Intent; intentP: number; clear: number }

/** Null (a failed check) proceeds, as before the checks existed. */
export function preDecision(check: PreCheck | null): "proceed" | "confirm" {
  if (!check) return "proceed"
  if (check.intent === "question" && check.intentP >= QUESTION_AT) return "proceed"
  if (check.clear >= CLEAR_AT) return "proceed"
  return "confirm"
}

export function postDecision(intent: Intent, matches: number | null, changeCount: number): "ok" | "retry" | "warn" {
  if (intent === "question" || matches === null || matches > MISMATCH_AT) return "ok"
  return changeCount === 0 ? "retry" : "warn"
}
