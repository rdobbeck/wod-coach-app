'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const CREDIT_PACKAGES = [
  { key: 5, credits: 5, price: 15, pricePerCredit: 3.00, label: null },
  { key: 10, credits: 10, price: 25, pricePerCredit: 2.50, label: "BEST VALUE", savings: 5 },
  { key: 25, credits: 25, price: 60, pricePerCredit: 2.40, label: null, savings: 15 },
  { key: 50, credits: 50, price: 100, pricePerCredit: 2.00, label: null, savings: 50 },
]

export default function CreditPurchaseButtons() {
  const router = useRouter()
  const [purchasing, setPurchasing] = useState<number | null>(null)

  const handlePurchase = async (packageKey: number) => {
    setPurchasing(packageKey)

    try {
      const res = await fetch("/api/ai/purchase-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create checkout session")
      }

      const data = await res.json()

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error: any) {
      console.error("Purchase error:", error)
      toast.error(error.message || "Failed to initiate purchase")
      setPurchasing(null)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CREDIT_PACKAGES.map((pkg) => (
          <button
            key={pkg.key}
            onClick={() => handlePurchase(pkg.key)}
            disabled={purchasing !== null}
            className={`border-2 rounded-lg p-4 transition disabled:opacity-50 disabled:cursor-not-allowed ${
              pkg.label
                ? "border-primary-600 bg-primary-50"
                : "border-gray-200 hover:border-primary-600"
            } ${purchasing === pkg.key ? "animate-pulse" : ""}`}
          >
            {pkg.label && (
              <div className="text-xs text-primary-600 font-bold mb-1">{pkg.label}</div>
            )}
            <div className="text-2xl font-bold mb-1">{pkg.credits}</div>
            <div className="text-sm text-gray-600">credits</div>
            <div className="text-lg font-semibold mt-2">${pkg.price}</div>
            {pkg.savings && (
              <div className="text-xs text-green-600 mt-1">Save ${pkg.savings}</div>
            )}
            <div className="text-xs text-gray-500 mt-1">${pkg.pricePerCredit}/credit</div>
            {purchasing === pkg.key && (
              <div className="text-xs text-primary-600 mt-2">Redirecting...</div>
            )}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500 mt-4 text-center">
        💳 Secure payment via Stripe • Credits never expire
      </p>
    </>
  )
}
