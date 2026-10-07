import PushFollow from "@/components/PushFollow"

/**
 * Coach shell. Pages bring their own chrome; this only mounts what every
 * signed-in coach page needs, and remounts when a coach arrives from sign-in.
 */
export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PushFollow />
      {children}
    </>
  )
}
