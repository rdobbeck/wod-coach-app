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
