import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import learn from "../data/anatomy/learn.json"

/**
 * Screenshots every scene's canvas from a running dev server (`npm run dev`, port 3011)
 * into public/anatomy/posters/<id>.jpg. Rerun after rebuilding assets.
 */
const base = process.env.POSTER_BASE ?? "http://127.0.0.1:3011"

async function main() {
  mkdirSync("public/anatomy/posters", { recursive: true })
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 })
  for (const s of learn.scenes) {
    await page.goto(`${base}/learn/${s.id}?poster=1`)
    await page.waitForFunction(() => (window as unknown as { __wodLearn?: { ready: boolean } }).__wodLearn?.ready === true, null, { timeout: 180_000 })
    await page.waitForTimeout(800)
    await page.locator("canvas").screenshot({ path: `public/anatomy/posters/${s.id}.jpg`, type: "jpeg", quality: 82 })
    console.log("poster", s.id)
  }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
