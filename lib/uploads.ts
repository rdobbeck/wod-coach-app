import { createClient } from "@supabase/supabase-js"
import { ALLOWED_MIME, MAX_BYTES } from "./uploads-shared"

/**
 * Photos and videos clients attach to a session.
 *
 * The bucket is private. Nothing is ever served from a public URL: uploads go
 * straight from the phone to Supabase with a one-shot signed token, and viewing
 * goes through a short-lived signed URL minted per request. That keeps a
 * client's form-check videos out of reach of anyone who guesses a path.
 */
export const BUCKET = "client-uploads"

export { ALLOWED_MIME, MAX_BYTES }

export const isVideo = (mime: string) => mime.startsWith("video/")

function admin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase storage is not configured")
  return createClient(url, key, { auth: { persistSession: false } })
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
}

/**
 * A one-shot URL the browser can upload to. The path is ours, never the
 * client's filename, so nothing user-supplied reaches the bucket.
 */
export async function signUpload(userId: string, mime: string) {
  const ext = EXT[mime] ?? "bin"
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(error?.message ?? "Could not start the upload")
  return { path, token: data.token, signedUrl: data.signedUrl }
}

/** A short-lived URL for viewing. Regenerated per page load, never stored. */
export async function signDownload(path: string, seconds = 3600) {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(path, seconds)
  if (error || !data) return null
  return data.signedUrl
}

/** Sign a batch in one call, returning a map of path to URL. */
export async function signDownloads(paths: string[], seconds = 3600) {
  if (!paths.length) return {}
  const { data } = await admin().storage.from(BUCKET).createSignedUrls(paths, seconds)
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl
  }
  return out
}

/** Remove files from the bucket, e.g. when their comment is deleted. */
export async function removeUploads(paths: string[]) {
  if (!paths.length) return
  await admin().storage.from(BUCKET).remove(paths)
}
