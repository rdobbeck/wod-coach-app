import { test, expect, type Page } from "@playwright/test"
import {
  lockRowByCoachrxId,
  unlockRowByCoachrxId,
  getNameForCoachrxId,
} from "./lib/supabase-admin"

// Stock CoachRx row chosen for the lock test. Stock means daily-sync-immutable
// upstream, so we don't risk lock state drifting from a coach-curated edit
// while the test runs. Use a row that's unlikely to be renamed.
const LOCK_TEST_COACHRX_ID = "33937997" // "1 1/4 Back Squat"

const CARD_SELECTOR = ".grid > a"
const NAME_SELECTOR = ".font-medium.text-gray-900"
const HEADER_PARA = "p.text-gray-600"

async function cardNames(page: Page): Promise<string[]> {
  return page.locator(`${CARD_SELECTOR} ${NAME_SELECTOR}`).allTextContents()
}
async function cardTagsByCard(page: Page): Promise<string[][]> {
  return page.$$eval(CARD_SELECTOR, (cards) =>
    cards.map((card) =>
      Array.from(card.querySelectorAll<HTMLSpanElement>(".text-xs")).map((s) =>
        (s.textContent || "").trim()
      )
    )
  )
}

test.describe("Exercise Library — auth guard", () => {
  // No storageState — fresh anonymous context.
  test.use({ storageState: { cookies: [], origins: [] } })

  test("logged-out users are redirected away from /coach/library", async ({ page }) => {
    const res = await page.goto("/coach/library", { waitUntil: "domcontentloaded" })
    // After redirects, we should land at "/" not "/coach/library".
    expect(page.url()).toMatch(/localhost:\d+\/$/)
    // Sanity: the final response is a 200 (the landing page rendered).
    expect(res?.status()).toBe(200)
  })
})

test.describe("Exercise Library — signed in as coach", () => {
  test("renders header with total count and ~48 cards on first page", async ({ page }) => {
    await page.goto("/coach/library")
    await expect(page.locator(HEADER_PARA)).toContainText(/exercises from CoachRx/)
    await expect(page.locator(HEADER_PARA)).toContainText(/Showing 1[–-]/)
    const count = await page.locator(CARD_SELECTOR).count()
    expect(count).toBeGreaterThanOrEqual(40)
    expect(count).toBeLessThanOrEqual(48)
  })

  test("search by name filters results", async ({ page }) => {
    await page.goto("/coach/library?q=burpee")
    const names = await cardNames(page)
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) {
      expect(n.toLowerCase()).toContain("burpee")
    }
  })

  test("pattern + equipment filters compose", async ({ page }) => {
    // Unfiltered total
    await page.goto("/coach/library")
    const headerAllText = (await page.locator(HEADER_PARA).textContent()) || ""
    const totalMatch = headerAllText.match(/([\d,]+) exercises/)
    expect(totalMatch).toBeTruthy()
    const total = parseInt(totalMatch![1].replace(/,/g, ""), 10)

    // Filtered: Squat + Barbell
    await page.goto("/coach/library?pattern=Squat&equipment=Barbell")
    const headerText = (await page.locator(HEADER_PARA).textContent()) || ""
    const filteredMatch = headerText.match(/([\d,]+) exercises/)
    expect(filteredMatch).toBeTruthy()
    const filtered = parseInt(filteredMatch![1].replace(/,/g, ""), 10)
    expect(filtered).toBeLessThan(total)
    expect(filtered).toBeGreaterThan(0)

    // Every visible card must have BOTH tags.
    const tagsByCard = await cardTagsByCard(page)
    for (const tags of tagsByCard) {
      expect(tags).toContain("Squat")
      expect(tags).toContain("Barbell")
    }
  })

  test("source filter shows only the matching badge", async ({ page }) => {
    await page.goto("/coach/library?source=stock")
    let tagsByCard = await cardTagsByCard(page)
    expect(tagsByCard.length).toBeGreaterThan(0)
    for (const tags of tagsByCard) {
      // First tag is always the source badge by render order.
      expect(tags[0]).toBe("Stock")
    }

    await page.goto("/coach/library?source=custom")
    tagsByCard = await cardTagsByCard(page)
    expect(tagsByCard.length).toBeGreaterThan(0)
    for (const tags of tagsByCard) {
      expect(tags[0]).toBe("Custom")
    }
  })

  test("pagination advances by 48 and shows different cards", async ({ page }) => {
    await page.goto("/coach/library")
    const page1Names = await cardNames(page)
    expect(page1Names.length).toBeGreaterThan(0)

    await page.goto("/coach/library?page=3")
    await expect(page.locator(HEADER_PARA)).toContainText(/Showing 97[–-]/)
    await expect(page.getByText(/Page 3 of/)).toBeVisible()
    const page3Names = await cardNames(page)
    expect(page3Names[0]).not.toBe(page1Names[0])
  })

  test("video card opens correct URL in a new tab", async ({ page, context }) => {
    await page.goto("/coach/library")
    const firstCard = page.locator(CARD_SELECTOR).first()
    const href = await firstCard.getAttribute("href")
    expect(href).toBeTruthy()
    expect(href).toMatch(/youtu\.be|youtube\.com|vimeo\.com/)

    const popupPromise = context.waitForEvent("page")
    await firstCard.click()
    const popup = await popupPromise
    // Popup URL should match (Chrome may follow short-url to full URL — accept the id substring).
    expect(popup.url()).toContain(href!.split("/").pop()!.split("?")[0])
    await popup.close()
  })

  test("locked rows render the yellow Locked badge", async ({ page }) => {
    // Before: lock the test row
    await lockRowByCoachrxId(LOCK_TEST_COACHRX_ID)
    try {
      const name = await getNameForCoachrxId(LOCK_TEST_COACHRX_ID)
      expect(name).toBeTruthy()
      // Encode the name as a URL search to find that single card.
      const q = encodeURIComponent(name!)
      await page.goto(`/coach/library?q=${q}`)
      // Find the card whose name is exactly the locked one.
      const card = page.locator(CARD_SELECTOR, { hasText: name! }).first()
      await expect(card).toBeVisible()
      await expect(card.getByText("Locked")).toBeVisible()
    } finally {
      // After: unlock so subsequent runs / manual states aren't affected.
      await unlockRowByCoachrxId(LOCK_TEST_COACHRX_ID)
    }
  })
})
