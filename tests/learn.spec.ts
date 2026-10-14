import { test, expect, type Page } from "@playwright/test"
import learn from "../data/anatomy/learn.json"

/** Learn: public pages, the viewer's selection and movement, failure states, the client tab. */
test.use({ storageState: { cookies: [], origins: [] } })

const ready = (page: Page) => page.waitForFunction(() => window.__wodLearn?.ready === true, null, { timeout: 90_000 })

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("the index lists joints and systems, links the credits, and has no client nav", async ({ page }) => {
  await page.goto("/learn")
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/learn the body/i)
  await expect(page.getByRole("link", { name: "Knee" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Muscular system" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Credits" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Today" })).toHaveCount(0)
})

test("knee: selecting from the list fills the card with the role; the slider moves the angle", async ({ page }) => {
  await page.goto("/learn/knee")
  await ready(page)
  await page.getByPlaceholder("Search structures").fill("rectus")
  await page.getByRole("button", { name: "Rectus femoris", exact: true }).click()
  const card = page.getByTestId("structure-card")
  await expect(card).toContainText("Rectus femoris")
  await expect(card).toContainText("antagonist")
  await expect(card).toContainText("opposes it")
  await expect(card).toContainText("Coach's note")
  await expect(page.getByRole("link", { name: "Train with Ryan" })).toBeVisible()
  await page.getByRole("slider", { name: "Knee flexion" }).fill("90")
  await expect(page.getByTestId("angle-out")).toHaveText("90°")
  expect(await page.evaluate(() => window.__wodLearn?.selected())).toBe("rectus-femoris-muscle")
})

test("a tap on empty space clears the selection", async ({ page }) => {
  await page.goto("/learn/knee")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("femur"))
  await expect(page.getByTestId("structure-card")).toContainText("Femur")
  const canvas = page.locator("canvas")
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + 8, box.y + 8) // top-left corner: nothing is drawn there
  await expect(page.getByTestId("structure-card")).toContainText("Tap a structure")
})

test("a scene whose model is missing shows the error and the list still works", async ({ page }) => {
  await page.route("**/anatomy/elbow.*.glb", (route) => route.fulfill({ status: 404, body: "" }))
  await page.goto("/learn/elbow")
  await expect(page.getByTestId("viewer-error")).toContainText(/couldn't load/i, { timeout: 60_000 })
  await page.getByRole("button", { name: "Brachialis", exact: true }).click()
  await expect(page.getByTestId("structure-card")).toContainText("Brachialis")
})

test("losing the WebGL context shows the stopped message", async ({ page }) => {
  await page.goto("/learn/knee")
  await ready(page)
  await page.evaluate(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2") as WebGL2RenderingContext
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  })
  await expect(page.getByTestId("viewer-error")).toContainText(/3D view stopped/i)
})

test("scene files are cached as immutable", async ({ request }) => {
  const res = await request.head(learn.scenes[0].file.path)
  expect(res.ok()).toBeTruthy()
  expect(res.headers()["cache-control"]).toContain("immutable")
})

test("clients get a Learn tab that opens the same scenes", async ({ page }) => {
  await signInAsClient(page)
  await page.goto("/client/learn")
  await expect(page.getByRole("link", { name: "Learn" })).toHaveAttribute("aria-current", "page")
  await page.getByRole("link", { name: "Knee" }).click()
  await ready(page)
  await expect(page.getByRole("link", { name: "Train with Ryan" })).toHaveCount(0)
})
