import { test, expect } from "@playwright/test"
import { expectedColumns, missingColumns } from "../lib/schema-drift"

/**
 * The deploy guard: a build stops when the database is missing a column the
 * code reads, instead of shipping pages that crash on every query.
 */
const models = [
  {
    name: "CoachProfile",
    dbName: null,
    fields: [
      { name: "id", dbName: undefined, kind: "scalar" },
      { name: "classFeedUrl", dbName: undefined, kind: "scalar" },
      { name: "user", dbName: undefined, kind: "object" },
    ],
  },
  { name: "ExerciseLibrary", dbName: null, fields: [{ name: "coachrxId", dbName: "coachrx_id", kind: "scalar" }] },
]

test("expected columns use the table and column names Postgres sees", () => {
  expect(expectedColumns(models)).toEqual([
    { table: "CoachProfile", column: "id" },
    { table: "CoachProfile", column: "classFeedUrl" },
    { table: "ExerciseLibrary", column: "coachrx_id" },
  ])
})

test("a column the code reads but the database lacks is reported", () => {
  const actual = [
    { table_name: "CoachProfile", column_name: "id" },
    { table_name: "ExerciseLibrary", column_name: "coachrx_id" },
  ]
  expect(missingColumns(expectedColumns(models), actual)).toEqual(["CoachProfile.classFeedUrl"])
})

test("a database that has everything reports nothing", () => {
  const actual = [
    { table_name: "CoachProfile", column_name: "id" },
    { table_name: "CoachProfile", column_name: "classFeedUrl" },
    { table_name: "ExerciseLibrary", column_name: "coachrx_id" },
    { table_name: "CoachProfile", column_name: "someOldColumn" },
  ]
  expect(missingColumns(expectedColumns(models), actual)).toEqual([])
})
