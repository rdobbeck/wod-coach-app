/**
 * Normalized exercise name, used to group exercise history when a row isn't
 * linked to a library exercise: lowercase, no ordering prefix ("A1."), no
 * punctuation. `dropParens` also removes parenthetical qualifiers.
 */
export function exerciseKey(name: string, dropParens = false) {
  let s = name.toLowerCase()
  if (dropParens) s = s.replace(/\([^)]*\)/g, " ")
  return s
    .replace(/^\s*[a-z]?\d+[.)]\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}
