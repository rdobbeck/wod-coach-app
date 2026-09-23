/**
 * Looks for the client app. The id is stored on ClientProfile.theme and set as
 * data-app-theme on the client shell; the variables themselves live in
 * globals.css. Swatch colours here are only for the picker in Settings.
 */
export type ClientTheme = {
  id: string
  name: string
  hint: string
  bg: string
  fg: string
  accent: string
}

export const THEMES: ClientTheme[] = [
  { id: "dark", name: "Gym Floor", hint: "Near black", bg: "#0e0f12", fg: "#f4f1ea", accent: "#c1272d" },
  { id: "light", name: "Chalk", hint: "Warm paper", bg: "#f4f2ed", fg: "#16181d", accent: "#c1272d" },
  { id: "blackout", name: "Blackout", hint: "True black", bg: "#000000", fg: "#f2f2f2", accent: "#e0343b" },
  { id: "midnight", name: "Midnight", hint: "Navy and ice", bg: "#0b1220", fg: "#e8eefc", accent: "#3f8cff" },
  { id: "platform", name: "Platform", hint: "Wood and amber", bg: "#14110d", fg: "#f3ece0", accent: "#d98324" },
  { id: "sunrise", name: "Sunrise", hint: "Light and warm", bg: "#fdf6ef", fg: "#241a12", accent: "#c1472d" },
]

export const THEME_IDS = THEMES.map((t) => t.id)

export const isTheme = (v: unknown): v is string => typeof v === "string" && THEME_IDS.includes(v)

/** Anything unknown (an old value, a bad write) falls back to the default look. */
export const resolveTheme = (v: unknown) => (isTheme(v) ? v : "dark")
