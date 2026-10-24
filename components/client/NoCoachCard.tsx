import SignOutButton from "./SignOutButton"

/**
 * Shown on Today when this account has no coach and nothing scheduled. The
 * usual cause is signing in with Google under a different Google account than
 * the email the coach invited, which quietly makes a second, empty account
 * (Murray, Oct 2026: his program sat on the invited account while his phone
 * showed nothing). Naming the signed-in email makes the mix-up obvious.
 */
export default function NoCoachCard({ email }: { email: string | null }) {
  return (
    <section data-testid="no-coach" className="mb-4 space-y-3 rounded-2xl border border-app-accent bg-app-surface p-4">
      <p className="font-display text-xl font-bold leading-tight">No training on this account yet</p>
      <div className="text-sm">
        <p>You&rsquo;re signed in as</p>
        {/* Its own line, so a long address only wraps when it truly can't fit. */}
        <p className="font-semibold [overflow-wrap:anywhere]">{email ?? "an account without an email"}</p>
        <p>which isn&rsquo;t connected to a coach.</p>
      </div>
      <p className="text-sm text-app-muted">
        If your coach invited you, sign out and sign in again with the email they invited. With Google, pick that same Google account.
      </p>
      <SignOutButton />
    </section>
  )
}
