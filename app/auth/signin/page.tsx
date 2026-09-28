'use client'

import { getProviders, signIn } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import AuthShell, { AuthError, GoogleMark, authField, authLabel, authLink, authPrimary, authSecondary } from "@/components/auth/AuthShell"

export default function SignIn() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  // Test login is only registered by the server on localhost/previews.
  const [devLogin, setDevLogin] = useState(false)

  useEffect(() => {
    getProviders().then((p) => setDevLogin(!!p?.["dev-login"]))
  }, [])

  // NextAuth sends failed sign-ins back here with ?error= (lib/auth.ts pages.error).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error")
    if (code) setError(signInErrorMessage(code))
  }, [])

  const handleDevLogin = (role: "COACH" | "CLIENT") => {
    setLoading(true)
    signIn("dev-login", { role, callbackUrl: role === "COACH" ? "/coach" : "/client" })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      })

      if (result?.error) {
        // authorize() throws "Invalid credentials" for a wrong login; anything
        // else is the server (usually the database) and worth another try.
        setError(result.error === "Invalid credentials" ? "Invalid email, username or password" : signInErrorMessage("Default"))
        setLoading(false)
        return
      }

      // Redirect based on role - will be handled by middleware/auth
      router.push("/")
      router.refresh()
    } catch (error) {
      setError("Something went wrong")
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Your training, from your coach."
      footer={
        <>
          Coach and new here? <Link href="/auth/signup?role=coach" className={authLink}>Create a coach account</Link>
          <br />
          Training with a coach? They&rsquo;ll send you an invite link.
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && <AuthError>{error}</AuthError>}
        <div>
          <label htmlFor="email-address" className={authLabel}>Email or username</label>
          <input
            id="email-address"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authField}
            placeholder="you@example.com or your username"
          />
        </div>
        <div>
          <label htmlFor="password" className={authLabel}>Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authField}
            placeholder="Your password"
          />
        </div>
        <button type="submit" disabled={loading} className={authPrimary}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-[#6f6a62]">
        <span className="h-px flex-1 bg-[#2c2f36]" />
        or
        <span className="h-px flex-1 bg-[#2c2f36]" />
      </div>

      <button onClick={() => signIn("google", { callbackUrl: "/" })} className={authSecondary}>
        <GoogleMark /> Continue with Google
      </button>

      {devLogin && (
        <div className="mt-6 rounded-xl border border-dashed border-amber-400/60 p-4">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-amber-300">
            Test login (not shown on the live site)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={() => handleDevLogin("COACH")} disabled={loading} className={authSecondary}>
              Test coach
            </button>
            <button onClick={() => handleDevLogin("CLIENT")} disabled={loading} className={authSecondary}>
              Test client
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  )
}

/** Plain-words versions of NextAuth's error codes. */
function signInErrorMessage(code: string) {
  switch (code) {
    case "OAuthAccountNotLinked":
      return "That email already has an account with a different sign-in. Use your email or username and password."
    case "AccessDenied":
      return "Google didn't let that sign-in through. Try again, or use your email and password."
    case "SessionRequired":
      return "Sign in to keep going."
    case "Verification":
      return "That sign-in link has expired. Ask your coach for a new one."
    default:
      return "We couldn't sign you in just now. Give it a moment and try again."
  }
}
