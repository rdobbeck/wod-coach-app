import { test, expect } from "@playwright/test"
import { normalizeUsername, usernameError, looksLikeEmail } from "../lib/username"

/** The rules for a sign-in username. Pure, so no browser or database needed. */
test("usernames are trimmed and lowercased", () => {
  expect(normalizeUsername("  Sasha_K ")).toBe("sasha_k")
})

test("valid usernames pass", () => {
  for (const ok of ["sasha", "sasha_k", "sasha.k", "sasha-k", "s4sha", "007", "a".repeat(30)]) {
    expect(usernameError(ok), ok).toBeNull()
  }
})

test("invalid usernames say why", () => {
  expect(usernameError("ab")).toMatch(/at least 3/i)
  expect(usernameError("a".repeat(31))).toMatch(/30 characters or fewer/i)
  expect(usernameError("sa sha")).toMatch(/letters, numbers/i)
  expect(usernameError("sasha!")).toMatch(/letters, numbers/i)
  expect(usernameError(".sasha")).toMatch(/start with a letter or number/i)
  expect(usernameError("-sasha")).toMatch(/start with a letter or number/i)
  // No "@": that is how the sign-in box tells a username from an email.
  expect(usernameError("sasha@gmail.com")).toMatch(/can't contain @/i)
  expect(usernameError("")).toMatch(/at least 3/i)
})

test("validation looks at the normalised form", () => {
  expect(usernameError("  Sasha_K  ")).toBeNull()
})

test("sign-in tells emails from usernames by the @", () => {
  expect(looksLikeEmail("sasha@gmail.com")).toBe(true)
  expect(looksLikeEmail("Sasha@Gmail.com")).toBe(true)
  expect(looksLikeEmail("sasha_k")).toBe(false)
})
