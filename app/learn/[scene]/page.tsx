import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import SceneView from "@/components/learn/SceneView"
import LearnCredits from "@/components/learn/LearnCredits"
import { getScene, getScenes, LEARN_CTA_URL, structuresFor } from "@/lib/learn"

export function generateStaticParams() {
  return getScenes().map((s) => ({ scene: s.id }))
}

export function generateMetadata({ params }: { params: { scene: string } }): Metadata {
  const s = getScene(params.scene)
  if (!s) return {}
  return {
    title: `${s.title} in 3D · Learn · WOD.COACH`,
    description: s.blurb,
    openGraph: { title: `${s.title} in 3D`, description: s.blurb, images: [`/anatomy/posters/${s.id}.jpg`] },
  }
}

export default function LearnScenePage({ params }: { params: { scene: string } }) {
  const scene = getScene(params.scene)
  if (!scene) notFound()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold leading-none">{scene.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{scene.blurb}</p>
      </div>
      <Suspense fallback={<div className="h-[58vh] animate-pulse rounded-2xl bg-app-surface2 md:h-[70vh]" />}>
        <SceneView scene={scene} structures={structuresFor(scene)} ctaUrl={LEARN_CTA_URL} />
      </Suspense>
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
