/**
 * The upload limits, in a file the browser can import.
 *
 * lib/uploads.ts pulls in the Supabase service-role client, which must never
 * reach a client bundle, so the plain constants live here and both sides agree
 * on them.
 */
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const

export const MAX_BYTES = 50 * 1024 * 1024
