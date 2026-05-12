import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

export function getAdmin(): SupabaseClient {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    )
  }
  cached = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "public" },
  })
  return cached
}

export async function lockRowByCoachrxId(coachrxId: string): Promise<void> {
  const supa = getAdmin()
  const { error } = await supa
    .from("ExerciseLibrary")
    .update({ locked: true })
    .eq("coachrx_id", coachrxId)
  if (error) throw new Error(`lockRowByCoachrxId(${coachrxId}): ${error.message}`)
}

export async function unlockRowByCoachrxId(coachrxId: string): Promise<void> {
  const supa = getAdmin()
  const { error } = await supa
    .from("ExerciseLibrary")
    .update({ locked: false })
    .eq("coachrx_id", coachrxId)
  if (error) throw new Error(`unlockRowByCoachrxId(${coachrxId}): ${error.message}`)
}

export async function getNameForCoachrxId(coachrxId: string): Promise<string | null> {
  const supa = getAdmin()
  const { data, error } = await supa
    .from("ExerciseLibrary")
    .select("name")
    .eq("coachrx_id", coachrxId)
    .single()
  if (error) throw new Error(`getNameForCoachrxId(${coachrxId}): ${error.message}`)
  return (data?.name as string) ?? null
}
