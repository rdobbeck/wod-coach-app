/**
 * Text size for the client app. Everything in the app is sized in rem, so the
 * root font size scales text and tap targets together (like the phone's own
 * display zoom). Kept per device in localStorage: it is about the screen and
 * the eyes in front of it, not the account. "Small" is the app's original size.
 */
export const TEXT_SIZES = [
  { id: "small", name: "Small", px: 16 },
  { id: "default", name: "Default", px: 17 },
  { id: "large", name: "Large", px: 19 },
  { id: "xl", name: "Extra large", px: 21 },
] as const
export type TextSizeId = (typeof TEXT_SIZES)[number]["id"]
export const TEXT_SIZE_KEY = "wod-text-size"
export const DEFAULT_TEXT_SIZE: TextSizeId = "default"

export const textSizePx = (id: string | null | undefined) =>
  (TEXT_SIZES.find((s) => s.id === id) ?? TEXT_SIZES.find((s) => s.id === DEFAULT_TEXT_SIZE)!).px

/** Runs inline before the first paint, so the page never flashes at the wrong size. */
export const TEXT_SIZE_SCRIPT = `(function(){try{var m=${JSON.stringify(Object.fromEntries(TEXT_SIZES.map((s) => [s.id, s.px])))};var v=null;try{v=localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)})}catch(e){}document.documentElement.style.fontSize=(m[v]||${textSizePx(DEFAULT_TEXT_SIZE)})+"px"}catch(e){}})()`
