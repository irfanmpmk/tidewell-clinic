// Run with: npm test   (Node's built-in test runner, TypeScript via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookableDates, freeSlots, slotsAcrossDoctors, type Busy, type DoctorHours } from "./schedule.ts";
import { clinicInstant } from "./time.ts";

const gp: DoctorHours = { id: 1, work_days: [1, 2, 3, 4, 5, 6], start_time: "09:00", end_time: "17:00" };
const dentist: DoctorHours = { id: 2, work_days: [1, 2, 3, 4, 5], start_time: "10:00", end_time: "12:00" };
const MONDAY = "2026-11-02";
const SUNDAY = "2026-11-01";
const longAgo = new Date("2026-01-01T00:00:00Z");
const busy = (doctor_id: number, from: string, to: string): Busy => ({
  doctor_id,
  starts_at: clinicInstant(MONDAY, from),
  ends_at: clinicInstant(MONDAY, to),
});

test("offers 15-minute steps within working hours", () => {
  const slots = freeSlots(gp, 30, MONDAY, [], longAgo);
  assert.equal(slots[0], "09:00");
  assert.equal(slots[1], "09:15");
  assert.equal(slots.at(-1), "16:30"); // last 30-minute slot ends at closing time
});

test("never overlaps the lunch break", () => {
  const slots = freeSlots(gp, 45, MONDAY, [], longAgo);
  assert.ok(slots.includes("12:15")); // ends 13:00
  assert.ok(!slots.includes("12:30")); // would end 13:15
  assert.ok(!slots.includes("13:30"));
  assert.ok(slots.includes("14:00"));
});

test("skips closed days and days the doctor does not work", () => {
  assert.deepEqual(freeSlots(gp, 15, SUNDAY, [], longAgo), []);
  assert.deepEqual(freeSlots(dentist, 15, "2026-11-07", [], longAgo), []); // Saturday
});

test("blocks times that overlap an existing appointment", () => {
  const slots = freeSlots(gp, 30, MONDAY, [busy(1, "10:00", "10:45")], longAgo);
  assert.ok(slots.includes("09:30")); // ends exactly when the booking starts
  assert.ok(!slots.includes("09:45")); // would overlap 10:00
  assert.ok(!slots.includes("10:30"));
  assert.ok(slots.includes("10:45")); // starts exactly when it ends
});

test("ignores other doctors' appointments", () => {
  const slots = freeSlots(gp, 30, MONDAY, [busy(2, "10:00", "11:00")], longAgo);
  assert.ok(slots.includes("10:00"));
});

test("hides times less than an hour from now", () => {
  const now = clinicInstant(MONDAY, "11:10");
  const slots = freeSlots(gp, 15, MONDAY, [], now);
  assert.equal(slots[0], "12:15");
});

test("a service longer than the doctor's day has no slots", () => {
  assert.deepEqual(freeSlots(dentist, 180, MONDAY, [], longAgo), []);
});

test("any-doctor view lists which doctors are free at each time", () => {
  const slots = slotsAcrossDoctors([gp, dentist], 30, MONDAY, [busy(1, "10:00", "10:30")], longAgo);
  assert.deepEqual(slots.find((s) => s.time === "10:00")?.doctorIds, [2]);
  assert.deepEqual(slots.find((s) => s.time === "09:00")?.doctorIds, [1]);
  assert.deepEqual(slots.find((s) => s.time === "10:30")?.doctorIds, [1, 2]);
});

test("bookable dates skip Sundays", () => {
  const dates = bookableDates([gp], "2026-10-31"); // Saturday
  assert.equal(dates[0], "2026-10-31");
  assert.equal(dates[1], "2026-11-02");
  assert.ok(!dates.includes(SUNDAY));
});
