import test from "node:test"
import assert from "node:assert/strict"
import { buildIcs, googleCalendarUrl, zonedToUtc, timeLabel, eventCopy, isTime, isTz, planIsStale, type PlannedEvent } from "../../lib/calendar-invite"

const ev = (over: Partial<PlannedEvent> = {}): PlannedEvent => ({
  id: "w1",
  day: "2026-10-15",
  time: "07:30",
  minutes: 60,
  tz: "America/Chicago",
  title: "Train: Lower, Heavy; Day 1",
  details: "Back Squat\nRDL",
  url: "https://wod.coach/client/workouts/w1",
  ...over,
})

test("local time in a timezone becomes the right UTC instant, either side of DST", () => {
  assert.equal(zonedToUtc("2026-10-15", "07:30", "America/Chicago").toISOString(), "2026-10-15T12:30:00.000Z") // CDT
  assert.equal(zonedToUtc("2026-12-01", "07:30", "America/Chicago").toISOString(), "2026-12-01T13:30:00.000Z") // CST
  assert.equal(zonedToUtc("2026-11-01", "09:00", "America/Chicago").toISOString(), "2026-11-01T15:00:00.000Z") // DST ended 2am that day
  assert.equal(zonedToUtc("2026-07-01", "18:00", "Europe/London").toISOString(), "2026-07-01T17:00:00.000Z")
  assert.equal(zonedToUtc("2026-07-01", "00:15", "UTC").toISOString(), "2026-07-01T00:15:00.000Z")
})

test("ics has one event per workout with UTC times, reminder, escaped text and CRLF", () => {
  const ics = buildIcs([ev(), ev({ id: "w2", day: "2026-10-16", time: "18:00", minutes: 45 })], new Date("2026-10-14T00:00:00Z"))
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/)
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2)
  assert.match(ics, /UID:workout-w1@wod\.coach/)
  assert.match(ics, /DTSTART:20261015T123000Z\r\nDTEND:20261015T133000Z/)
  assert.match(ics, /DTSTART:20261016T230000Z\r\nDTEND:20261016T234500Z/)
  assert.ok(ics.includes("SUMMARY:Train: Lower\\, Heavy\\; Day 1"))
  assert.match(ics, /TRIGGER:-PT30M/)
  assert.ok(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), "lines folded to 75 octets")
  assert.ok(!/[^\r]\n/.test(ics), "only CRLF line endings")
})

test("google link carries title, UTC dates and details", () => {
  const u = new URL(googleCalendarUrl(ev()))
  assert.equal(u.hostname, "calendar.google.com")
  assert.equal(u.searchParams.get("action"), "TEMPLATE")
  assert.equal(u.searchParams.get("dates"), "20261015T123000Z/20261015T133000Z")
  assert.match(u.searchParams.get("details")!, /Open it: https:\/\/wod\.coach\/client\/workouts\/w1/)
})

test("helpers", () => {
  assert.equal(timeLabel("07:05"), "7:05 AM")
  assert.equal(timeLabel("12:00"), "12:00 PM")
  assert.equal(timeLabel("00:30"), "12:30 AM")
  assert.equal(timeLabel("18:45"), "6:45 PM")
  assert.ok(isTime("23:59") && !isTime("24:00") && !isTime("7:30"))
  assert.ok(isTz("America/Chicago") && !isTz("Mars/Base") && !isTz(""))
  assert.equal(eventCopy("Pull", Array.from({ length: 10 }, (_, i) => `E${i}`)).details.split("\n").pop(), "+ 2 more")
  assert.equal(planIsStale(new Date(1), new Date(2)), true)
  assert.equal(planIsStale(new Date(2), new Date(1)), false)
  assert.equal(planIsStale(null, new Date(1)), false)
})
