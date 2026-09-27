import { createClient } from "@supabase/supabase-js"

/**
 * Profile photos. They show on a coach's public page, so the bucket is public
 * and the user row keeps just the URL. (They used to be stored inline as data:
 * URLs, which bloated every query and once the session cookie.)
 */
export const AVATAR_BUCKET = "avatars"

function admin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase storage is not configured")
  return createClient(url, key, { auth: { persistSession: false } })
}

let bucketReady = false
async function ensureBucket(sb: ReturnType<typeof admin>) {
  if (bucketReady) return
  const { data } = await sb.storage.getBucket(AVATAR_BUCKET)
  if (!data) {
    const { error } = await sb.storage.createBucket(AVATAR_BUCKET, { public: true, fileSizeLimit: 1024 * 1024, allowedMimeTypes: ["image/jpeg"] })
    if (error && !/already exists/i.test(error.message)) throw error
  }
  bucketReady = true
}

/** Our own copy's path inside the bucket, or null for any other URL (Google photos, etc). */
const ownPath = (url: string | null | undefined) => {
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`
  const i = url?.indexOf(marker) ?? -1
  return i >= 0 ? url!.slice(i + marker.length) : null
}

/**
 * Stores a JPEG (a data: URL from the browser) and returns its public URL.
 * The file name changes on every save, so browsers never show a stale photo.
 */
export async function saveAvatar(userId: string, dataUrl: string, previous?: string | null) {
  const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "")
  const sb = admin()
  await ensureBucket(sb)
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await sb.storage.from(AVATAR_BUCKET).upload(path, Buffer.from(b64, "base64"), { contentType: "image/jpeg", upsert: true })
  if (error) throw error
  await removeAvatar(previous)
  return sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Deletes our stored copy, if the URL is one. Never throws: a leftover file is harmless. */
export async function removeAvatar(url: string | null | undefined) {
  const path = ownPath(url)
  if (!path) return
  await admin().storage.from(AVATAR_BUCKET).remove([path]).catch(() => {})
}
