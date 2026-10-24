import type { Context, Turn, Change } from "@/lib/ai/assist"
import type { Question } from "@/lib/ai/decide"

export type Intent = "question" | "change_exercises" | "schedule" | "videos" | "unclear"

export const checksOn = () => process.env.AI_CHECKS !== "off"

// Thresholds on Jev's probabilities, tuned with scripts/eval-ai-check.ts. Clear asks score about
// 0.35 and up, vague ones 0.2 and under; a change set that misses its ask scores near 0.
export const CLEAR_AT = 0.3
export const QUESTION_AT = 0.8
export const MISMATCH_AT = 0.2

export const MISMATCH_WARNING = "These edits may not be what you asked for. Check before applying."

export const PRE_QUESTIONS: { clear: Question; intent: Question } = {
  clear: {
    type: "noul",
    instructions:
      "A strength coach could act on `message` without guessing what is wanted. If `recent_turns` ends with the assistant asking something and `message` answers it (a yes or no, a day, a pick), it is clear, however short. A request is clear when it gives a change, or a goal or limit to plan around (an injury, the equipment on hand, a load increase), and which sessions it covers: a day, a span of days or weeks, or every session. It need not name exercises; the coach picks those. A plain question is clear. It is not clear when it gives no target or no direction for the change.",
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
      "At least one edit is listed in `proposed_changes`, and the edits do what `message` asks: the right kind of edit, on the right day, to the right exercise or session. `proposed_changes` of none means no edit is listed.",
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
