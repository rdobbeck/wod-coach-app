import { ownerEmails } from "@/lib/plans"

/**
 * Who may use the AI library builder: owner accounts, plus any coach listed in
 * LIBRARY_AI_COACH_EMAILS (comma separated). The list is read on every call so
 * a test can change it. Phase 2 (Pro and Studio) replaces this with a plan check.
 */
export function canUseLibraryAi(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.trim().toLowerCase()
  const extra = (process.env.LIBRARY_AI_COACH_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return ownerEmails().includes(e) || extra.includes(e)
}
