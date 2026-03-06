'use client'

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

export default function PurchaseSuccessHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const success = searchParams.get("success")
    const cancelled = searchParams.get("cancelled")
    const credits = searchParams.get("credits")

    if (success === "true" && credits) {
      toast.success(`Success! ${credits} credits added to your account.`)
      // Clean up URL
      router.replace("/coach/settings/ai")
    } else if (cancelled === "true") {
      toast.error("Purchase cancelled. No charges were made.")
      // Clean up URL
      router.replace("/coach/settings/ai")
    }
  }, [searchParams, router])

  return null
}
