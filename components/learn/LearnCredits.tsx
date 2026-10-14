import Link from "next/link"
import { CREDITS_LINE } from "@/lib/learn"

export default function LearnCredits({ creditsHref }: { creditsHref: string }) {
  return (
    <p className="text-[11px] leading-relaxed text-app-muted">
      {CREDITS_LINE} <Link href={creditsHref} className="underline">Credits</Link>
    </p>
  )
}
