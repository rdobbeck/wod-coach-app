/**
 * Connection URLs, optionally pointed at a non-production Postgres schema.
 *
 * DB_SCHEMA=preview keeps preview deploys and local development in their own
 * schema inside the same Supabase project, so test data never mixes with real
 * client data. Unset (production) = the default `public` schema.
 */
function withSchema(url: string | undefined, schema: string | undefined) {
  if (!url || !schema) return url
  return `${url}${url.includes("?") ? "&" : "?"}schema=${encodeURIComponent(schema)}`
}

export const dbUrl = () => withSchema(process.env.POSTGRES_PRISMA_URL, process.env.DB_SCHEMA)
export const directDbUrl = () => withSchema(process.env.POSTGRES_URL_NON_POOLING, process.env.DB_SCHEMA)
