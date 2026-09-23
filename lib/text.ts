/**
 * Ryan's copy rule: no em or en dashes anywhere clients see.
 * "Ring Row — Body at 45°" -> "Ring Row, Body at 45°"
 * "rest 60–90 sec"         -> "rest 60-90 sec"   (ranges keep a hyphen)
 */
export function noLongDashes<T extends string | null | undefined>(text: T): T {
  if (!text) return text
  return text
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2") // numeric ranges
    .replace(/\s*[—–]\s*/g, ", ") // everything else becomes a comma
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",") as T
}
