import { test, expect, type Page } from "@playwright/test"
import { buildGear, type Catalog } from "../lib/gear"
import gear from "../data/gear.json"

/**
 * Gear: Ryan's partner deals and picks, mirrored from ryandobbeck.com/gear.
 * Partners come first, in revenue order; staged items never ship.
 */

const catalog: Catalog = {
  meta: {
    disclosures: { equip: "Equip note", nunorm: "NUNORM note", amazon: "Amazon note — with a dash" },
    categories: ["training_gear", "nutrition"],
    category_disclaimers: { nutrition: "Ask your doctor." },
    updated: "2026-10-01",
  },
  products: [
    { id: "a1", name: "Rings", category: "training_gear", amazon_url: "https://amzn.to/a1", featured: false },
    { id: "a2", name: "Vest", category: "training_gear", amazon_url: "https://amzn.to/a2", featured: true },
    { id: "nun", name: "NUNORM", category: "training_gear", source: "nunorm", affiliate_url: "https://nunorm.example", promo_code: "CODE10" },
    { id: "eq", name: "Equip — Protein", category: "nutrition", source: "equip", affiliate_url: "https://equip.example", promo_code: "EQUIPPED" },
    { id: "vg", name: "Grips", category: "training_gear", source: "victorygrips", affiliate_url: "https://vg.example" },
    { id: "fs1", name: "Collection A", category: "nutrition", source: "fullscript", affiliate_url: "https://fs.example" },
    { id: "fs2", name: "Collection B", category: "nutrition", source: "fullscript", affiliate_url: "https://fs.example" },
    { id: "st", name: "Staged thing", category: "nutrition", source: "steppa", affiliate_url: "https://st.example", staged: true },
    { id: "nourl", name: "Broken", category: "nutrition" },
  ],
}

test("tiers: partners first in revenue order, featured picks first, staged and broken dropped", () => {
  const g = buildGear(catalog)
  expect(g.partners.map((p) => p.id)).toEqual(["eq", "nun", "vg"])
  expect(g.partners[0].code).toBe("EQUIPPED")
  expect(g.partners[0].name).toBe("Equip, Protein")
  // One storefront, one card.
  expect(g.morePartners.map((p) => p.id)).toEqual(["fullscript-dispensary"])
  expect(g.picks.map((c) => c.key)).toEqual(["training_gear"])
  expect(g.picks[0].items.map((i) => i.id)).toEqual(["a2", "a1"])
  expect(g.picks[0].items[0].cta).toBe("View on Amazon")
  const ids = JSON.stringify(g)
  expect(ids).not.toContain('"st"')
  expect(ids).not.toContain("nourl")
  expect(g.disclosures).toEqual(["Equip note", "NUNORM note", "Amazon note, with a dash"])
  expect(g.disclaimers.nutrition).toBe("Ask your doctor.")
})

test("the shipped data has the three partnerships up top and no dashes", () => {
  expect(gear.partners.map((p) => p.source)).toEqual(["equip", "nunorm", "victorygrips"])
  expect(gear.morePartners[0].id).toBe("fullscript-dispensary")
  expect(gear.picks.length).toBeGreaterThanOrEqual(5)
  expect(JSON.stringify(gear)).not.toMatch(/[—–]/)
  expect(JSON.stringify(gear)).not.toContain("steppa")
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("client reaches Gear from Today, sees partners first, copies a code", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, permissions: ["clipboard-read", "clipboard-write"] })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const card = page.getByRole("link", { name: /Gear and partner deals/ })
  await expect(card).toBeVisible()
  await card.click()
  await page.waitForURL(/\/client\/gear$/)

  // Hero cards, in order, before anything else.
  const heroes = page.getByTestId("partner-card")
  await expect(heroes).toHaveCount(3)
  await expect(heroes.nth(0)).toContainText("Equip")
  await expect(heroes.nth(1)).toContainText("NUNORM")
  await expect(heroes.nth(2)).toContainText("Victory Grips")

  // Outbound links open in a new tab and are marked sponsored.
  const shop = heroes.nth(0).getByRole("link", { name: /Shop Equip Foods/ })
  await expect(shop).toHaveAttribute("href", "https://www.equipfoods.com/EQUIPPED")
  await expect(shop).toHaveAttribute("target", "_blank")
  await expect(shop).toHaveAttribute("rel", /sponsored/)

  // Tap the code to copy it.
  await heroes.nth(0).getByRole("button", { name: /EQUIPPED/ }).click()
  await expect(heroes.nth(0).getByText("Copied")).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("EQUIPPED")

  // Chips jump to each category, and the full list is on the page.
  await expect(page.getByRole("link", { name: "Books" })).toHaveAttribute("href", "#books")
  await expect(page.locator("#books")).toBeVisible()
  expect(await page.getByTestId("pick-row").count()).toBeGreaterThan(100)
  await expect(page.getByText("Always check with your doctor")).toBeVisible()
  await expect(page.getByText(/Amazon Associate/)).toBeVisible()

  await ctx.close()
})
