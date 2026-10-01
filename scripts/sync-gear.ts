/**
 * Copy the ryandobbeck.com gear catalog into the app.
 *
 *   npx tsx scripts/sync-gear.ts [path/to/catalog.json]
 *
 * Reads ~/Documents/affiliate-gear/catalog.json by default, applies the tier
 * ordering in lib/gear.ts, drops staged items, and writes data/gear.json.
 * Rerun after any catalog edit, then commit data/gear.json.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { buildGear, type Catalog } from "../lib/gear"

const source = process.argv[2] ?? join(homedir(), "Documents/affiliate-gear/catalog.json")
const target = join(__dirname, "..", "data", "gear.json")

const catalog = JSON.parse(readFileSync(source, "utf8")) as Catalog
const gear = buildGear(catalog)
writeFileSync(target, JSON.stringify(gear, null, 2) + "\n")

const count = gear.partners.length + gear.morePartners.length + gear.picks.reduce((n, c) => n + c.items.length, 0)
console.log(`Wrote ${target}: ${gear.partners.length} partners, ${gear.morePartners.length} more partners, ${count} items total`)
