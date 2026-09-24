'use client'

import { toast } from "sonner"

/** Copies a URL to the clipboard, with a toast. */
export default function CopyLinkButton({ url, label = "Copy" }: { url: string; label?: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"))}
      className="rounded-lg border border-[#ddd7cc] px-2.5 py-1 text-xs font-semibold text-[#16181d]"
    >
      {label}
    </button>
  )
}
