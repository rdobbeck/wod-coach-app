'use client'

import ErrorScreen from "@/components/ErrorScreen"

// Catches crashes in the root layout itself, so it ships its own <html>.
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 antialiased">
        <ErrorScreen {...props} />
      </body>
    </html>
  )
}
