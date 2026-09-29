#!/usr/bin/env tsx
/**
 * Creates (or updates) the WOD.COACH products and prices in whichever Stripe
 * account STRIPE_PLATFORM_SECRET_KEY points at. Same steps as the owner's
 * "Set up Stripe plans" button on Plan & billing (lib/stripe-catalog.ts).
 *
 *   npx tsx --env-file=.env.local scripts/stripe-setup.ts
 */
import { ensureCatalog } from "../lib/stripe-catalog"

ensureCatalog()
  .then((lines) => lines.forEach((l, i) => console.log(i ? `  ${l}` : `[stripe-setup] ${l}`)))
  .catch((e) => {
    console.error("[stripe-setup] failed:", e.message)
    process.exit(1)
  })
