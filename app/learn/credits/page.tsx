import type { Metadata } from "next"

export const metadata: Metadata = { title: "Credits · Learn · WOD.COACH" }

export default function LearnCreditsPage() {
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed">
      <h1 className="font-display text-3xl font-bold">Credits and licences</h1>
      <p>The 3D scenes in Learn are built from <a href="https://www.z-anatomy.com" className="underline">Z-Anatomy</a>, the libre 3D atlas of anatomy by Gauthier Kervyn and contributors, licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline">CC BY-SA 4.0</a>. Z-Anatomy is based on <a href="https://lifesciencedb.jp/bp3d/" className="underline">BodyParts3D</a>, © The Database Center for Life Science, licensed CC BY 4.0.</p>
      <p>The joint scenes use the region method and configurations of <a href="https://github.com/maikleonhg/atlas" className="underline">maikleonhg/atlas</a>, CC BY-SA 4.0.</p>
      <p>Structure definitions are Wikipedia text as shipped inside Z-Anatomy, CC BY-SA. Coach&apos;s notes are written by Ryan Dobbeck and are not part of the open data.</p>
      <p>Our processed scene files are published under CC BY-SA 4.0; see <a href="/anatomy/LICENSE.md" className="underline">the licence file</a>.</p>
      <p>Learn is for education. It is not medical advice.</p>
    </article>
  )
}
