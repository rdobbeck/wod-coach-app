import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * Encrypts secrets we have to keep but must never show again, like a coach's
 * own OpenRouter API key. AES-256-GCM, with the key derived from the app's
 * NEXTAUTH_SECRET so there is no extra secret to manage. Rotating
 * NEXTAUTH_SECRET makes stored secrets unreadable; coaches would re-enter
 * their key.
 *
 * Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64url parts).
 * Server-only. Never import this into a client component.
 */
const PREFIX = "enc:v1:"

function key() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set; can't encrypt or decrypt secrets")
  return Buffer.from(hkdfSync("sha256", secret, "wod-coach", "secret-box:v1", 32))
}

export const isSealed = (v: string | null | undefined) => !!v && v.startsWith(PREFIX)

export function seal(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return PREFIX + [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(":")
}

/**
 * Returns the plain secret. Values stored before encryption existed are
 * returned as they are, so callers keep working while they get re-sealed.
 */
export function open(stored: string): string {
  if (!isSealed(stored)) return stored
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64url"))
  const decipher = createDecipheriv("aes-256-gcm", key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}

/** "…1a2b": enough for a coach to recognise their key, useless to anyone else. */
export function hint(stored: string | null | undefined): string | null {
  if (!stored) return null
  try {
    const plain = open(stored)
    return plain.length > 8 ? `…${plain.slice(-4)}` : "saved"
  } catch {
    return "saved (unreadable, please re-enter)"
  }
}
