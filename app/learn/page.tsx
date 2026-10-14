import type { Metadata } from "next"
import SceneCards from "@/components/learn/SceneCards"
import LearnCredits from "@/components/learn/LearnCredits"
import { getJointScenes, getSystemScenes, LEARN_CTA_URL } from "@/lib/learn"

export const metadata: Metadata = {
  title: "Learn anatomy · WOD.COACH",
  description: "Bend a knee and watch the hamstrings work. Spin the heart. Tap any muscle, bone, vessel or nerve and read what it does. Free, in your browser.",
}

export default function LearnIndex() {
  return (
    <div className="space-y-10">
      <section className="space-y-3 pt-4">
        <h1 className="font-display text-4xl font-bold leading-none md:text-5xl">Learn the body you train</h1>
        <p className="max-w-2xl text-app-muted">Real 3D anatomy, built from an open atlas. Bend the joints, turn the systems, tap anything to read what it does and how training changes it.</p>
        <a href={LEARN_CTA_URL} className="inline-flex h-11 items-center rounded-xl bg-app-accent px-5 text-sm font-bold text-app-accent-text">Train with Ryan</a>
      </section>
      <SceneCards scenes={getJointScenes()} base="/learn" heading="Joints: bend them" intro="Slide the joint through its range and watch which muscles work and which let go." />
      <SceneCards scenes={getSystemScenes()} base="/learn" heading="Systems: spin them" intro="The major structures of each system. Toggle layers, tap to read." />
      <LearnCredits creditsHref="/learn/credits" />
    </div>
  )
}
