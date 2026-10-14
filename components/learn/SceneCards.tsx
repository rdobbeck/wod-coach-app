import Link from "next/link"
import type { Scene } from "@/lib/learn-types"

/* eslint-disable @next/next/no-img-element -- posters are static files in public/anatomy/posters */

export default function SceneCards({ scenes, base, heading, intro }: { scenes: Scene[]; base: string; heading: string; intro: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-bold">{heading}</h2>
        <p className="text-sm text-app-muted">{intro}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {scenes.map((s) => (
          <li key={s.id}>
            <Link href={`${base}/${s.id}`} className="block overflow-hidden rounded-2xl border border-app-border bg-app-surface" aria-label={s.title}>
              <div className="aspect-[3/4] bg-app-surface2">
                <img src={`/anatomy/posters/${s.id}.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <h3 className="font-display text-lg font-bold leading-tight">{s.title}</h3>
                <p className="mt-1 line-clamp-3 text-xs text-app-muted">{s.blurb}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
