'use client'

import { useEffect } from "react"
import { followSignedInAccount } from "@/lib/push-client"

/**
 * Re-save this phone's push registration under the signed-in account (see
 * followSignedInAccount). Mounted in the client and coach shells, so it runs
 * on app open and again whenever someone arrives there from sign-in.
 */
export default function PushFollow() {
  useEffect(() => {
    followSignedInAccount().catch(() => undefined)
  }, [])
  return null
}
