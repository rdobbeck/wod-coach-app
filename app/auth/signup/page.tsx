'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { BRAND_DOMAIN, normalizeSlug, suggestSlug } from "@/lib/coach-link"
import AuthShell, { AuthError, authField, authLabel, authLink, authPrimary } from "@/components/auth/AuthShell"

export default function SignUp() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "CLIENT" as "COACH" | "CLIENT"
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  // Coach link (<slug>.wod.coach): follows their first name until they edit it.
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugStatus, setSlugStatus] = useState<{ ok: boolean; error?: string } | null>(null)

  // Landing page links here with ?role=coach
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("role") === "coach") setFormData((f) => ({ ...f, role: "COACH" }))
  }, [])

  useEffect(() => {
    if (!slugEdited) setSlug(suggestSlug(formData.name))
  }, [formData.name, slugEdited])

  useEffect(() => {
    if (formData.role !== "COACH" || !slug) return setSlugStatus(null)
    const t = setTimeout(async () => {
      const res = await fetch(`/api/coach/slug?slug=${encodeURIComponent(slug)}`).catch(() => null)
      if (res?.ok) setSlugStatus(await res.json())
    }, 350)
    return () => clearTimeout(t)
  }, [slug, formData.role])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match")
      setLoading(false)
      return
    }

    if (formData.role === "COACH" && slugStatus && !slugStatus.ok) {
      setError(`Your link: ${slugStatus.error}`)
      setLoading(false)
      return
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          ...(formData.role === "COACH" && slug ? { slug } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Something went wrong")
        setLoading(false)
        return
      }

      const result = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password,
      })

      if (result?.error) {
        setError("Account created but failed to sign in. Please sign in manually.")
        setLoading(false)
        return
      }

      if (formData.role === "COACH") {
        router.push("/coach")
      } else {
        router.push("/client")
      }
      router.refresh()
    } catch (error) {
      setError("Something went wrong")
      setLoading(false)
    }
  }

  const coach = formData.role === "COACH"
  const field = (id: "name" | "email" | "password" | "confirmPassword", label: string, type: string, placeholder: string, autoComplete?: string) => (
    <div>
      <label htmlFor={id} className={authLabel}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        value={formData[id]}
        onChange={(e) => setFormData({ ...formData, [id]: e.target.value })}
        className={authField}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <AuthShell
      title={coach ? "Create your coach account" : "Create your account"}
      subtitle={coach ? "Free to try. Add a client, build their program, and send them a link." : undefined}
      footer={
        <>
          Already have an account? <Link href="/auth/signin" className={authLink}>Sign in</Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && <AuthError>{error}</AuthError>}

        <div>
          <p className={authLabel}>I&rsquo;m a...</p>
          <div className="grid grid-cols-2 gap-3">
            {(["COACH", "CLIENT"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setFormData({ ...formData, role: r })}
                aria-pressed={formData.role === r}
                className={`h-12 rounded-xl border text-base font-semibold transition ${
                  formData.role === r ? "border-[#c1272d] bg-[#c1272d]/15 text-[#f4f1ea]" : "border-[#2c2f36] text-[#8c8478]"
                }`}
              >
                {r === "COACH" ? "Coach" : "Client"}
              </button>
            ))}
          </div>
        </div>

        {field("name", "Full name", "text", "Jordan Reyes", "name")}
        {field("email", "Email", "email", "you@example.com", "email")}
        {field("password", "Password", "password", "At least 6 characters", "new-password")}
        {field("confirmPassword", "Confirm password", "password", "Same again", "new-password")}

        {coach && (
          <div>
            <label htmlFor="slug" className={authLabel}>Your link</label>
            <div className="flex items-center rounded-xl border border-[#2c2f36] bg-[#0e0f12] focus-within:border-[#c1272d]">
              <input
                id="slug"
                name="slug"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(normalizeSlug(e.target.value.replace(/\s/g, "-")).slice(0, 30))
                }}
                className="min-w-0 flex-1 rounded-l-xl bg-transparent px-4 py-3 text-right text-base text-[#f4f1ea] placeholder:text-[#6f6a62] focus:outline-none"
                placeholder="yourname"
              />
              <span className="pr-4 text-base text-[#8c8478]">.{BRAND_DOMAIN}</span>
            </div>
            <p className={`mt-1.5 text-xs ${slugStatus && !slugStatus.ok ? "text-[#f4b8ba]" : "text-[#8c8478]"}`}>
              {slugStatus && !slugStatus.ok
                ? slugStatus.error
                : "Your clients sign in from your own page. You can change it later in Settings."}
            </p>
          </div>
        )}

        <button type="submit" disabled={loading} className={authPrimary}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  )
}
