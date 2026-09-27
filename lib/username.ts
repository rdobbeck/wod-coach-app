/**
 * Sign-in usernames. Stored lowercase, so uniqueness needs no case-insensitive index.
 * They can't contain "@": that is how the sign-in box tells a username from an email.
 */
const MIN = 3
const MAX = 30

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase()

export const looksLikeEmail = (value: string) => value.includes("@")

/** null when the username is fine, otherwise a message the person can act on. */
export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw)
  if (u.includes("@")) return "Usernames can't contain @. Use your email to sign in with it instead."
  if (u.length < MIN) return `Use at least ${MIN} characters.`
  if (u.length > MAX) return `Use ${MAX} characters or fewer.`
  if (!/^[a-z0-9]/.test(u)) return "Start with a letter or number."
  if (!/^[a-z0-9._-]+$/.test(u)) return "Use letters, numbers, dots, dashes and underscores only."
  return null
}
