/** Compare the columns the Prisma schema reads with the ones a database actually has. */

type DmmfModel = { readonly name: string; readonly dbName: string | null; readonly fields: readonly { readonly name: string; readonly dbName?: string | null; readonly kind: string }[] }
export type Column = { table: string; column: string }

/** Every stored column of every model, under the names Postgres uses (@@map / @map applied). Relations are not columns. */
export function expectedColumns(models: readonly DmmfModel[]): Column[] {
  return models.flatMap((m) =>
    m.fields
      .filter((f) => f.kind === "scalar" || f.kind === "enum")
      .map((f) => ({ table: m.dbName ?? m.name, column: f.dbName ?? f.name }))
  )
}

/** "Table.column" for each expected column the database lacks. Extra database columns are fine. */
export function missingColumns(expected: Column[], actual: { table_name: string; column_name: string }[]): string[] {
  const have = new Set(actual.map((a) => `${a.table_name}.${a.column_name}`))
  return expected.map((e) => `${e.table}.${e.column}`).filter((k) => !have.has(k))
}
