'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"

interface AISettingsFormProps {
  coach: {
    id: string
    aiProvider: "GEMINI_FREE" | "PAY_PER_PROGRAM" | "BRING_YOUR_OWN_KEY"
    openrouterApiKey: string | null
    preferredModel: string | null
  }
}

const AVAILABLE_MODELS = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (Recommended)", description: "Best for complex programs" },
  { id: "anthropic/claude-opus-4", name: "Claude Opus 4 (Premium)", description: "Highest quality, slower" },
  { id: "openai/gpt-4-turbo", name: "GPT-4 Turbo", description: "Fast and reliable" },
  { id: "google/gemini-pro-1.5-exp", name: "Gemini Pro 1.5", description: "Google's best model" },
  { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", description: "Open source, cost-effective" },
]

export default function AISettingsForm({ coach }: AISettingsFormProps) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState(coach.openrouterApiKey || "")
  const [selectedModel, setSelectedModel] = useState(coach.preferredModel || "anthropic/claude-sonnet-4")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const handleSaveSettings = async () => {
    setSaving(true)
    setMessage("")

    try {
      const res = await fetch("/api/ai/update-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openrouterApiKey: apiKey,
          preferredModel: selectedModel,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to update settings")
      }

      setMessage("Settings saved successfully!")
      router.refresh()
    } catch (error) {
      setMessage("Error saving settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Configuration</h2>

      {coach.aiProvider === "BRING_YOUR_OWN_KEY" && (
        <>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenRouter API Key
            </label>
            <p className="text-sm text-gray-600 mb-3">
              Get your API key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                openrouter.ai/keys
              </a>
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-2">
              Your API key is encrypted and stored securely. We never see your usage or charges.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preferred Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {AVAILABLE_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.description}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Different models have different costs. Check{" "}
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                OpenRouter pricing
              </a>
              .
            </p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>

          {message && (
            <div className={`mt-4 p-3 rounded-lg ${message.includes("Error") ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
              {message}
            </div>
          )}
        </>
      )}

      {coach.aiProvider === "GEMINI_FREE" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Free Plan:</strong> You can generate up to 5 programs per month using Google's Gemini 2.0 Flash model.
            Upgrade to pay-per-program for unlimited access with Claude Sonnet 4, or bring your own API key for full control.
          </p>
        </div>
      )}

      {coach.aiProvider === "PAY_PER_PROGRAM" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            <strong>Pay-Per-Program:</strong> We use Claude Sonnet 4 to generate high-quality programs. Each generation costs $3 and uses 1 credit.
            Purchase credits above to continue generating programs.
          </p>
        </div>
      )}
    </div>
  )
}
