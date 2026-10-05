import type { ClassFeed } from "@/lib/classes"
import { classDateLabel } from "@/lib/classes"

/**
 * Upcoming group classes the coach teaches, soonest first, each with a link to
 * the gym's own booking page. Rendered on the client's Book a class page.
 */
export default function ClassList({ classes, firstName, text }: { classes: ClassFeed; firstName: string; text: string | null }) {
  return (
        <section data-testid="classes" className="space-y-3">
          <h2 className="font-display text-2xl font-bold leading-tight">
            Classes with {firstName}
            {classes.gym.name ? <span className="block text-sm font-normal text-app-muted">at {classes.gym.name}</span> : null}
          </h2>
          {classes.classes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-app-border p-5 text-sm text-app-muted">No classes on the schedule yet.</p>
          ) : (
            <ul className="space-y-2">
              {classes.classes.map((c) => (
                <li
                  key={`${c.date}-${c.start}`}
                  data-testid="class"
                  className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {classDateLabel(c.date)} · {c.start}
                      {c.end ? ` to ${c.end}` : ""}
                    </span>
                    <span className="block text-sm text-app-muted">{c.title}</span>
                  </span>
                  {c.bookUrl ? (
                    <a
                      href={c.bookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white"
                    >
                      Book
                    </a>
                  ) : classes.gym.scheduleUrl ? (
                    <a
                      href={classes.gym.scheduleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-xl border border-app-border px-4 py-2 text-sm font-semibold text-app-text"
                    >
                      Schedule
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-app-muted">
            Booking runs through {classes.gym.name ? `${classes.gym.name}'s` : "the gym's"} own system.
            {text ? (
              <>
                {" "}
                <a href={text} className="font-semibold text-app-text">
                  Text {firstName}
                </a>{" "}
                to confirm you&rsquo;re coming.
              </>
            ) : null}
          </p>
        </section>
      
  )
}
