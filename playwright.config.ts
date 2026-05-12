import { defineConfig, devices } from "@playwright/test"
import { config as loadEnv } from "dotenv"

// Mirror Next.js convention: .env.local takes precedence
loadEnv({ path: ".env.local", override: true })
loadEnv({ path: ".env" })

const PORT = 3011
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // tests share an auth state + occasionally mutate DB
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./.auth/coach.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
