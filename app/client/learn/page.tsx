import SceneCards from "@/components/learn/SceneCards"
import LearnCredits from "@/components/learn/LearnCredits"
import { getJointScenes, getSystemScenes } from "@/lib/learn"
import { requireClient } from "@/lib/require-client"

export default async function ClientLearn() {
  await requireClient()
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold leading-none">Learn</h1>
        <p className="mt-1 text-sm text-app-muted">The body you train, in 3D. Bend the joints, turn the systems, tap anything.</p>
      </div>
      <SceneCards scenes={getJointScenes()} base="/client/learn" heading="Joints" intro="Slide through the range and watch the muscles work." />
      <SceneCards scenes={getSystemScenes()} base="/client/learn" heading="Systems" intro="Major structures, layer by layer." />
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
