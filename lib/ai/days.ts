/**
 * The next date of each weekday from today. A big program is asked about in
 * parts, and each part used to read "Monday" as the first Monday it held, so
 * one swap landed on three Mondays. Every part now gets the same table.
 */
export function dayNames(today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    return `${d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${key}${i === 0 ? " (today)" : ""}`
  }).join("\n")
}

/** This week and next week as Monday to Sunday dates, so "next week" on a Saturday means the week starting in two days, not the one after. */
export function weekRanges(today: string) {
  const d = new Date(`${today}T12:00:00Z`)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  const at = (days: number) => {
    const x = new Date(monday)
    x.setUTCDate(monday.getUTCDate() + days)
    return x.toISOString().slice(0, 10)
  }
  return `this week: ${at(0)} to ${at(6)}\nnext week: ${at(7)} to ${at(13)}`
}
