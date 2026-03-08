'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

interface ProviderSwitchButtonsProps {
  currentProvider: "GEMINI_FREE" | "VENICE_FREE" | "PAY_PER_PROGRAM" | "BRING_YOUR_OWN_KEY"
}

export default function ProviderSwitchButtons({ currentProvider }: ProviderSwitchButtonsProps) {
  const router = useRouter()
  const [switching, setSwitching] = useState(false)

  const switchProvider = async (newProvider: string) => {
    setSwitching(true)
    try {
      const res = await fetch("/api/ai/update-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProvider: newProvider }),
      })

      if (!res.ok) throw new Error("Failed to switch provider")

      toast.success("AI provider updated successfully!")
      router.refresh()
    } catch (error) {
      toast.error("Failed to switch provider")
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="grid md:grid-cols-4 gap-6">
      {/* Free Plan - Gemini */}
      <div className={`border-2 rounded-lg p-6 ${currentProvider === "GEMINI_FREE" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
        <h3 className="text-lg font-bold mb-2">Free (Gemini)</h3>
        <div className="text-3xl font-black mb-4">$0</div>
        <ul className="space-y-2 text-sm text-gray-600 mb-6">
          <li>✓ 5 programs/month</li>
          <li>✓ Google Gemini 2.0</li>
          <li>✓ Good quality</li>
          <li>✗ Monthly limit</li>
        </ul>
        {currentProvider !== "GEMINI_FREE" && (
          <button
            onClick={() => switchProvider("GEMINI_FREE")}
            disabled={switching}
            className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
          >
            {switching ? "Switching..." : "Switch"}
          </button>
        )}
      </div>

      {/* Free Plan - Venice */}
      <div className={`border-2 rounded-lg p-6 ${currentProvider === "VENICE_FREE" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
        <h3 className="text-lg font-bold mb-2">Free (Venice)</h3>
        <div className="text-3xl font-black mb-4">$0</div>
        <ul className="space-y-2 text-sm text-gray-600 mb-6">
          <li>✓ Unlimited programs</li>
          <li>✓ Llama 3.3 70B</li>
          <li>✓ Privacy-focused</li>
          <li>✓ No data retention</li>
        </ul>
        {currentProvider !== "VENICE_FREE" && (
          <button
            onClick={() => switchProvider("VENICE_FREE")}
            disabled={switching}
            className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
          >
            {switching ? "Switching..." : "Switch"}
          </button>
        )}
      </div>

      {/* Pay-Per-Program */}
      <div className={`border-2 rounded-lg p-6 ${currentProvider === "PAY_PER_PROGRAM" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
        <div className="text-xs font-bold text-primary-600 uppercase mb-2">Most Popular</div>
        <h3 className="text-lg font-bold mb-2">Pay-Per-Program</h3>
        <div className="text-3xl font-black mb-4">$3<span className="text-lg text-gray-500">/program</span></div>
        <ul className="space-y-2 text-sm text-gray-600 mb-6">
          <li>✓ Unlimited programs</li>
          <li>✓ Claude Sonnet 4</li>
          <li>✓ Best quality results</li>
          <li>✓ Pay only what you use</li>
        </ul>
        {currentProvider !== "PAY_PER_PROGRAM" && (
          <button
            onClick={() => switchProvider("PAY_PER_PROGRAM")}
            disabled={switching}
            className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {switching ? "Switching..." : "Switch to Pay-Per-Program"}
          </button>
        )}
      </div>

      {/* BYOK */}
      <div className={`border-2 rounded-lg p-6 ${currentProvider === "BRING_YOUR_OWN_KEY" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
        <h3 className="text-lg font-bold mb-2">Your API Key</h3>
        <div className="text-3xl font-black mb-4">Custom</div>
        <ul className="space-y-2 text-sm text-gray-600 mb-6">
          <li>✓ Unlimited programs</li>
          <li>✓ Choose any model</li>
          <li>✓ Full control</li>
          <li>✓ No WOD markup</li>
        </ul>
        {currentProvider !== "BRING_YOUR_OWN_KEY" && (
          <button
            onClick={() => switchProvider("BRING_YOUR_OWN_KEY")}
            disabled={switching}
            className="w-full bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
          >
            {switching ? "Switching..." : "Use Your Key"}
          </button>
        )}
      </div>
    </div>
  )
}
