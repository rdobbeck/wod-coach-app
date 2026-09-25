'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"

interface AISettingsFormProps {
  /** "…1a2b" when a key is saved; the key itself never reaches the browser. */
  keyHint: string | null
  preferredModel: string | null
}

const AVAILABLE_MODELS = [
  { id: "anthropic/claude-fable-5.1", name: "Claude Fable 5.1 (Recommended)", description: "Top quality, ~$2 per 16-week program" },
  { id: "anthropic/claude-opus-5", name: "Claude Opus 5", description: "Excellent, ~$1 per program" },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", description: "Very good, ~$0.40 per program" },
]

const field = "w-full rounded-xl border border-[#ddd7cc] bg-white px-3 py-2 text-sm"

/** Your own OpenRouter key: saving one switches AI programs to it, removing it switches back. */
export default function AISettingsForm({ keyHint, preferredModel }: AISettingsFormProps) {
  const router = useRouter()
  // Starts empty: typing replaces the saved key, leaving it empty keeps it.
  const [apiKey, setApiKey] = useState("")
  const [selectedModel, setSelectedModel] = useState(preferredModel || "anthropic/claude-fable-5.1")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const save = async (body: Record<string, string>, done: string) => {
    setSaving(true)
    setMessage("")
    try {
      const res = await fetch("/api/ai/update-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save")
      setApiKey("")
      setMessage(done)
      router.refresh()
    } catch (error) {
      setMessage(`Error: ${(error as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[#e4dfd5] bg-white p-5">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">Use your own OpenRouter key (optional)</p>
      <p className="mt-2 text-sm text-[#4a443c]">
        {keyHint ? `Using your key ${keyHint}.` : "Most coaches skip this."} Get a key at{" "}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
          openrouter.ai/keys
        </a>
        . It's encrypted before it's stored and never shown again.
      </p>

      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={keyHint ? `Saved key ${keyHint}. Paste a new one to replace it.` : "sk-or-v1-..."}
        autoComplete="off"
        className={`${field} mt-3`}
      />

      {keyHint && (
        <label className="mt-4 block text-sm text-[#4a443c]">
          Model for your key
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className={`${field} mt-1`}>
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} - {m.description}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() =>
            save({ ...(apiKey.trim() ? { openrouterApiKey: apiKey.trim() } : {}), preferredModel: selectedModel }, apiKey.trim() ? "Key saved. AI programs now use it." : "Saved")
          }
          disabled={saving || (!apiKey.trim() && !keyHint)}
          className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-50"
        >
          {saving ? "Saving..." : keyHint ? "Save" : "Save key"}
        </button>
        {keyHint && (
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ openrouterApiKey: "" }, "Key removed. AI goes back to your plan and balance.")}
            className="text-sm font-semibold text-[#6b6257] underline"
          >
            Remove key
          </button>
        )}
      </div>

      {message && <p className={`mt-3 text-sm ${message.startsWith("Error") ? "text-[#c1272d]" : "text-[#2f7d4f]"}`}>{message}</p>}
    </section>
  )
}
