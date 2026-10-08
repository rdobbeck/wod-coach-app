/**
 * Small, non-interactive pictures of the real screens, one per tour slide, so
 * the words have something to point at. They reuse the classes of the parts
 * they show (WorkoutPlayer's set rows and rest bar, CommentThread, TodayView's
 * week strip and call card, BottomNav), so they follow the client's theme and
 * look like what they'll actually tap. Decorative: the slide text says it all.
 */

const Frame = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div aria-hidden="true" className={`pointer-events-none select-none overflow-hidden rounded-2xl border border-app-border bg-app-bg p-3 ${className}`}>
    {children}
  </div>
)

const Svg = ({ children, size = 18 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

/** BottomNav, Today selected. */
export function TabsVisual() {
  const tabs: [string, React.ReactNode][] = [
    ["Today", <path key="today" d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />],
    ["History", <g key="history"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>],
    ["Messages", <path key="messages" d="M4 5h16v11H8l-4 4z" />],
    ["Settings", <g key="settings"><circle cx="12" cy="8" r="4" /><path d="M6 20a6 6 0 0 1 12 0" /></g>],
  ]
  return (
    <Frame className="p-0">
      <div className="grid grid-cols-4 border-t border-app-border bg-app-surface">
        {tabs.map(([label, icon], n) => (
          <span key={label} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${n === 0 ? "text-app-accent" : "text-app-muted"}`}>
            <Svg size={20}>{icon}</Svg>
            {label}
          </span>
        ))}
      </div>
    </Frame>
  )
}

const Cell = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-9 items-center justify-between rounded-lg border border-app-border bg-app-bg px-2 text-sm">
    <span className="text-app-muted">−</span>
    <span className="font-bold text-app-text">{children}</span>
    <span className="text-app-muted">+</span>
  </span>
)

/** WorkoutPlayer's set rows: set one ticked, set two filled in and waiting. */
export function LoggingVisual() {
  return (
    <Frame className="bg-app-surface">
      <p className="mb-2 text-xs text-app-muted">
        <span className="font-semibold text-app-text">Last time (Sep 28):</span> 135 × 5, 135 × 5, 140 × 4
      </p>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1.25rem_1fr_1fr_2.5rem] gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-app-muted">
          <span>Set</span>
          <span>lb</span>
          <span>Reps</span>
          <span className="text-center">Done</span>
        </div>
        {[true, false].map((done, i) => (
          <div key={i} className="grid grid-cols-[1.25rem_1fr_1fr_2.5rem] items-center gap-2">
            <span className="font-display text-base font-semibold text-app-muted">{i + 1}</span>
            <Cell>135</Cell>
            <Cell>5</Cell>
            <span
              className={`flex h-9 items-center justify-center rounded-lg border text-sm ${
                done ? "border-app-good bg-app-good text-white" : "pulse-cta border-app-border text-app-muted"
              }`}
            >
              ✓
            </span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/** The rest bar that appears above the tab bar after a tick, counting down. */
/** The rest timer surface from RestTimer.tsx: Pause, the time (tap it to change), Skip, with the countdown drawn as the border. */
export function RestVisual() {
  return (
    <Frame className="p-2">
      <div className="relative flex h-[104px] w-full items-center justify-between gap-2 overflow-hidden rounded-[24px] bg-app-surface px-3 shadow-lg">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 320 104" preserveAspectRatio="none" fill="none">
          <rect x="2.5" y="2.5" width="315" height="99" rx="21.5" stroke="var(--app-border)" strokeWidth="5" />
          <rect x="2.5" y="2.5" width="315" height="99" rx="21.5" stroke="var(--app-accent)" strokeWidth="5" strokeLinecap="round" pathLength={1} strokeDasharray={1} className="tour-rest-ring" />
        </svg>
        <span className="relative flex h-10 w-[68px] shrink-0 items-center justify-center rounded-full bg-[rgba(var(--app-accent-rgb),0.15)] text-[13px] font-semibold text-app-accent">Pause</span>
        <span className="relative flex min-w-0 flex-1 flex-col items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-muted">Rest</span>
          <span className="font-display text-[34px] font-bold leading-none tabular-nums text-app-text">1:30</span>
        </span>
        <span className="relative flex h-10 w-[60px] shrink-0 items-center justify-center rounded-full bg-app-surface2 text-[13px] font-semibold text-app-text">Skip</span>
      </div>
    </Frame>
  )
}

/** A session's comment thread: their clip, the coach's note under it, and the + to attach. */
export function VideoVisual({ coachName }: { coachName: string }) {
  return (
    <Frame className="space-y-2 bg-app-surface">
      <div className="ml-auto w-fit max-w-[80%] rounded-xl bg-app-surface2 px-2.5 py-2">
        <span className="relative flex h-16 w-28 items-center justify-center rounded-lg bg-black/60 text-white">
          <Svg size={22}><path d="M8 5v14l11-7z" fill="currentColor" /></Svg>
          <span className="absolute bottom-1 right-1.5 text-[10px] font-semibold">0:12</span>
        </span>
        <p className="mt-1 text-xs text-app-text">Set 3 felt slow off the floor</p>
      </div>
      <div className="w-fit max-w-[85%] rounded-xl bg-app-surface2 px-2.5 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-app-muted">{coachName || "Your coach"}</p>
        <p className="text-xs text-app-text">Hips are shooting up first. Brace, then push the floor away.</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="pulse-cta flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-app-border text-lg text-app-text">+</span>
        <span className="flex h-9 flex-1 items-center rounded-xl border border-app-border bg-app-surface2 px-3 text-xs text-app-muted">Add a comment</span>
      </div>
    </Frame>
  )
}

/** TodayView's Book a call card. */
export function CallsVisual() {
  return (
    <Frame>
      <div className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-3 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-surface2 text-app-text">
          <Svg size={20}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold leading-tight text-app-text">Book a call</span>
          <span className="block text-xs text-app-muted">2 free calls left this month</span>
        </span>
        <span className="text-app-muted">&rarr;</span>
      </div>
    </Frame>
  )
}

/** TodayView's week strip, with a held session being dropped onto Thursday. */
export function WeekVisual() {
  const days = ["M", "T", "W", "T", "F", "S", "S"]
  return (
    <Frame className="relative pb-14">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">This week</span>
        <span className="text-xs font-semibold text-app-accent">Plan my week</span>
      </div>
      <div className="flex gap-1">
        {days.map((d, i) => (
          <span
            key={i}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 ${
              i === 0 ? "bg-app-accent text-app-accent-text" : i === 3 ? "tour-drop bg-app-surface ring-2 ring-app-accent" : "bg-app-surface text-app-text"
            }`}
          >
            <span className={`text-[10px] font-semibold ${i === 0 ? "text-app-accent-text/80" : "text-app-muted"}`}>{d}</span>
            <span className="font-display text-sm font-semibold leading-none">{5 + i}</span>
          </span>
        ))}
      </div>
      <span className="tour-drag absolute bottom-2.5 left-6 flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2 shadow-xl">
        <span className="h-6 w-1 rounded-full bg-app-accent" />
        <span>
          <span className="block font-display text-sm font-bold leading-tight text-app-text">Lower body A</span>
          <span className="block text-[10px] text-app-muted">5 exercises</span>
        </span>
      </span>
    </Frame>
  )
}

/** The red Ask AI button and one proposed change under it, as the client sees them. Static on purpose: no motion to respect. The button and Apply keep the panel's own red in every theme. */
export function AskAiVisual() {
  return (
    <Frame className="space-y-2 bg-app-surface">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-app-text px-3 py-2 text-xs text-app-bg">
        My shoulder is irritated. No overhead work for two weeks.
      </div>
      <div className="rounded-xl border border-app-border bg-app-surface2 px-2.5 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-app-muted">Thu &middot; Upper</p>
        <p className="mt-1 text-xs text-app-text">
          <span className="mr-1.5 rounded bg-[rgba(var(--app-accent-rgb),0.15)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-accent">replace</span>
          <span className="text-app-muted line-through">Strict Press</span> &rarr; <span className="font-semibold">Landmine Press</span>
        </p>
        <div className="mt-2 flex gap-2">
          <span className="flex h-8 flex-1 items-center justify-center rounded-lg bg-[#c1272d] font-display text-xs font-bold uppercase tracking-wide text-white">Apply 1 change</span>
          <span className="flex h-8 items-center rounded-lg border border-app-border px-3 text-xs font-semibold text-app-muted">Discard</span>
        </div>
      </div>
      <div className="flex justify-end">
        <span className="flex items-center gap-1.5 rounded-full bg-[#c1272d] px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.06em] text-white shadow">
          &#10022; Ask AI
        </span>
      </div>
    </Frame>
  )
}

/** What lands on their lock screen. */
export function NotificationVisual({ coachName }: { coachName: string }) {
  return (
    <Frame className="bg-gradient-to-b from-app-surface2 to-app-bg">
      <div className="flex items-start gap-2.5 rounded-2xl bg-app-surface/90 p-2.5 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="flex justify-between text-[11px]">
            <span className="font-semibold text-app-text">WOD</span>
            <span className="text-app-muted">now</span>
          </span>
          <span className="block text-xs font-semibold text-app-text">{coachName || "Your coach"} left a note</span>
          <span className="block truncate text-xs text-app-muted">Great depth on set 3. Add 5 lb next week.</span>
        </span>
      </div>
    </Frame>
  )
}
