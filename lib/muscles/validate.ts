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
