// Availability rules, kept free of database and framework code so they can be unit tested.
import { addDays, clinicInstant, fromMinutes, toMinutes, weekday } from "./time.ts";

export const CLOSED_WEEKDAYS = [0]; // Sunday
export const LUNCH = { start: "13:00", end: "14:00" };
export const STEP_MIN = 15;
export const LEAD_MIN = 60; // earliest bookable time is an hour from now
export const BOOKING_WINDOW_DAYS = 14;

export interface DoctorHours {
  id: number;
  work_days: number[];
  start_time: string;
  end_time: string;
}

export interface Busy {
  doctor_id: number;
  starts_at: Date;
  ends_at: Date;
}

export const worksOn = (doctor: DoctorHours, date: string) =>
  !CLOSED_WEEKDAYS.includes(weekday(date)) && doctor.work_days.includes(weekday(date));

/** Start times ('HH:MM') at which `doctor` can take an appointment of `durationMin` on `date`. */
export function freeSlots(doctor: DoctorHours, durationMin: number, date: string, busy: Busy[], now: Date): string[] {
  if (!worksOn(doctor, date)) return [];
  const open = toMinutes(doctor.start_time);
  const close = toMinutes(doctor.end_time);
  const lunchStart = toMinutes(LUNCH.start);
  const lunchEnd = toMinutes(LUNCH.end);
  const earliest = now.getTime() + LEAD_MIN * 60_000;
  const mine = busy.filter((b) => b.doctor_id === doctor.id);

  const slots: string[] = [];
  for (let t = open; t + durationMin <= close; t += STEP_MIN) {
    const end = t + durationMin;
    if (t < lunchEnd && end > lunchStart) continue;
    const start = clinicInstant(date, fromMinutes(t)).getTime();
    if (start < earliest) continue;
    const finish = start + durationMin * 60_000;
    if (mine.some((b) => b.starts_at.getTime() < finish && b.ends_at.getTime() > start)) continue;
    slots.push(fromMinutes(t));
  }
  return slots;
}

/** For "any available doctor": each free start time with the doctors free then. */
export function slotsAcrossDoctors(doctors: DoctorHours[], durationMin: number, date: string, busy: Busy[], now: Date) {
  const byTime = new Map<string, number[]>();
  for (const d of doctors) {
    for (const t of freeSlots(d, durationMin, date, busy, now)) byTime.set(t, [...(byTime.get(t) ?? []), d.id]);
  }
  return [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, doctorIds]) => ({ time, doctorIds }));
}

/** Bookable dates from `today`: within the window, not closed, and with at least one doctor working. */
export function bookableDates(doctors: DoctorHours[], today: string) {
  const dates: string[] = [];
  for (let i = 0; i < BOOKING_WINDOW_DAYS; i++) {
    const d = addDays(today, i);
    if (doctors.some((doc) => worksOn(doc, d))) dates.push(d);
  }
  return dates;
}
