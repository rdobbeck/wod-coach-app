/**
 * Structure identity for Learn. Z-Anatomy names its objects like
 * "Rectus femoris muscle.r"; the trailing .r/.l is the side. The id is the
 * name without the side, slugified, so left and right share one structure.
 * Used by the build pipeline and by the viewer, so it must stay dependency free.
 */
const SIDE_RE = /\.(r|l)$/

export const baseName = (name: string) => name.replace(SIDE_RE, "")

export const sideOf = (name: string): "r" | "l" | "m" => (name.endsWith(".r") ? "r" : name.endsWith(".l") ? "l" : "m")

export function slugify(name: string) {
  return baseName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * "Rectus femoris muscle" -> "Rectus femoris"; "(Adductor minimus)" -> "Adductor minimus".
 * Z-Anatomy marks some names with an editorial asterisk and a few carry doubled spaces; both go.
 */
export function labelFrom(base: string) {
  const s = base
    .replace(/\*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/\s+muscles?$/i, "")
    .trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
