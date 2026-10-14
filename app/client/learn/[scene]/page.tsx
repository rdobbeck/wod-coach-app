import { notFound } from "next/navigation"
import { Suspense } from "react"
import SceneView from "@/components/learn/SceneView"
import LearnCredits from "@/components/learn/LearnCredits"
import { getScene, structuresFor } from "@/lib/learn"
import { requireClient } from "@/lib/require-client"

export default async function ClientLearnScene({ params }: { params: { scene: string } }) {
  await requireClient()
  const scene = getScene(params.scene)
  if (!scene) notFound()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold leading-none">{scene.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{scene.blurb}</p>
      </div>
      <Suspense fallback={<div className="h-[58vh] animate-pulse rounded-2xl bg-app-surface2" />}>
        <SceneView scene={scene} structures={structuresFor(scene)} />
      </Suspense>
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
