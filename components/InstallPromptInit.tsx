'use client'

import { initInstallPrompt } from "@/lib/install-prompt"

// Runs as soon as the app's JS loads, on every page, so Android Chrome's one-off
// `beforeinstallprompt` is caught before the tour (which offers it) mounts.
initInstallPrompt()

export default function InstallPromptInit() {
  return null
}
