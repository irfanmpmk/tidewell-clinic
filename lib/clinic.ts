import { connection } from "next/server";
import { getDb, type Tx } from "./db";
import { freeSlots, slotsAcrossDoctors, worksOn, type Busy } from "./schedule.ts";
import { addDays, clinicDate, clinicInstant } from "./time.ts";
import { newRef, seedAppointments } from "./seed";

export interface Doctor {
  id: number;
  slug: string;
  name: string;
  title: string;
  specialty: string;
  bio: string;
  languages: string[];
  work_days: number[];
  start_time: string;
  end_time: string;
  color: string;
}

export interface Service {
  id: number;
  slug: string;
  name: string;
  specialty: string;
  duration_min: number;
  price: number;
  description: string;
}

export const STATUSES = ["booked", "checked_in", "completed", "no_show", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  booked: "Booked",
  checked_in: "Checked in",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export interface Appointment {
  id: number;
  ref: string;
  starts_at: Date;
  ends_at: Date;
  patient_name: string;
  phone: string;
  email: string | null;
  notes: string;
  new_patient: boolean;
  status: Status;
  doctor_id: number;
  doctor_name: string;
  doctor_title: string;
  doctor_color: string;
  service_name: string;
  service_slug: string;
  duration_min: number;
  price: number;
  upcoming: boolean; // still booked and in the future
}

const APPT_SELECT = `
  SELECT a.id, a.ref, a.starts_at, a.ends_at, a.patient_name, a.phone, a.email, a.notes, a.new_patient, a.status,
         a.doctor_id, d.name AS doctor_name, d.title AS doctor_title, d.color AS doctor_color,
         s.name AS service_name, s.slug AS service_slug, s.duration_min, s.price,
         (a.status = 'booked' AND a.starts_at > now()) AS upcoming
  FROM clinic.appointments a
  JOIN clinic.doctors d ON d.id = a.doctor_id
  JOIN clinic.services s ON s.id = a.service_id`;

export async function getDoctors(): Promise<Doctor[]> {
  await connection();
  return (await getDb()).query<Doctor>("SELECT * FROM clinic.doctors ORDER BY id");
}

export async function getServices(): Promise<Service[]> {
  await connection();
  return (await getDb()).query<Service>("SELECT * FROM clinic.services ORDER BY specialty, price");
}

async function busyFor(tx: Tx, doctorIds: number[], date: string): Promise<Busy[]> {
  if (!doctorIds.length) return [];
  return tx.query<Busy>(
    `SELECT doctor_id, starts_at, ends_at FROM clinic.appointments
     WHERE doctor_id = ANY($1) AND status <> 'cancelled' AND starts_at < $3 AND ends_at > $2`,
    [doctorIds, clinicInstant(date, "00:00"), clinicInstant(addDays(date, 1), "00:00")],
  );
}

/** Free start times for a service on a date, for one doctor or for any doctor offering it. */
export async function availability(service: Service, doctors: Doctor[], date: string) {
  await connection();
  const db = await getDb();
  const busy = await busyFor(db, doctors.map((d) => d.id), date);
  return slotsAcrossDoctors(doctors, service.duration_min, date, busy, new Date());
}

export class SlotTakenError extends Error {}

/**
 * Books inside one transaction: lock the candidate doctors' rows, re-check the slot against
 * current appointments, then insert. Two people choosing the same slot at once cannot both get it.
 */
export async function bookAppointment(input: {
  service: Service;
  doctorIds: number[]; // one doctor, or every doctor offering the service for "any available"
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string;
  newPatient: boolean;
}): Promise<string> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const docs = await tx.query<Doctor>(
      "SELECT * FROM clinic.doctors WHERE id = ANY($1) ORDER BY id FOR UPDATE",
      [input.doctorIds],
    );
    const busy = await busyFor(tx, docs.map((d) => d.id), input.date);
    // Spread "any doctor" bookings: pick the free doctor with the fewest appointments that day.
    const free = docs
      .filter((d) => worksOn(d, input.date) && freeSlots(d, input.service.duration_min, input.date, busy, new Date()).includes(input.time))
      .sort((a, b) => busy.filter((x) => x.doctor_id === a.id).length - busy.filter((x) => x.doctor_id === b.id).length);
    if (!free.length) throw new SlotTakenError();

    const starts = clinicInstant(input.date, input.time);
    const ends = new Date(starts.getTime() + input.service.duration_min * 60_000);
    const ref = newRef();
    await tx.query(
      `INSERT INTO clinic.appointments (ref, doctor_id, service_id, starts_at, ends_at, patient_name, phone, email, notes, new_patient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [ref, free[0].id, input.service.id, starts, ends, input.name, input.phone, input.email, input.notes, input.newPatient],
    );
    return ref;
  });
}

export async function getAppointment(ref: string): Promise<Appointment | undefined> {
  await connection();
  const [row] = await (await getDb()).query<Appointment>(`${APPT_SELECT} WHERE a.ref = $1`, [ref]);
  return row;
}

export async function cancelAppointment(ref: string) {
  await (await getDb()).query(
    "UPDATE clinic.appointments SET status = 'cancelled' WHERE ref = $1 AND status = 'booked' AND starts_at > now()",
    [ref],
  );
}

// ---------------------------------------------------------------- Staff

export async function appointmentsOn(date: string): Promise<Appointment[]> {
  await connection();
  return (await getDb()).query<Appointment>(
    `${APPT_SELECT} WHERE a.starts_at >= $1 AND a.starts_at < $2 ORDER BY a.starts_at, d.id`,
    [clinicInstant(date, "00:00"), clinicInstant(addDays(date, 1), "00:00")],
  );
}

export async function setStatus(id: number, status: Status) {
  await (await getDb()).query("UPDATE clinic.appointments SET status = $2 WHERE id = $1", [id, status]);
}

export async function clinicStats(date: string) {
  await connection();
  const db = await getDb();
  const weekStart = addDays(date, -6);
  const [s] = await db.query<{ today: number; upcoming_week: number; past: number; no_shows: number; new_patients: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE starts_at >= $1 AND starts_at < $2 AND status <> 'cancelled')::int AS today,
       COUNT(*) FILTER (WHERE starts_at >= $2 AND starts_at < $3 AND status = 'booked')::int AS upcoming_week,
       COUNT(*) FILTER (WHERE starts_at >= $4 AND starts_at < $2 AND status IN ('completed', 'no_show'))::int AS past,
       COUNT(*) FILTER (WHERE starts_at >= $4 AND starts_at < $2 AND status = 'no_show')::int AS no_shows,
       COUNT(*) FILTER (WHERE starts_at >= $4 AND starts_at < $2 AND new_patient AND status IN ('checked_in', 'completed'))::int AS new_patients
     FROM clinic.appointments`,
    [clinicInstant(date, "00:00"), clinicInstant(addDays(date, 1), "00:00"), clinicInstant(addDays(date, 8), "00:00"), clinicInstant(weekStart, "00:00")],
  );
  const services = await db.query<{ name: string; count: number; revenue: number }>(
    `SELECT s.name, COUNT(*)::int AS count, SUM(s.price)::int AS revenue
     FROM clinic.appointments a JOIN clinic.services s ON s.id = a.service_id
     WHERE a.status = 'completed' AND a.starts_at >= $1
     GROUP BY s.id ORDER BY count DESC LIMIT 5`,
    [clinicInstant(weekStart, "00:00")],
  );
  return { ...s, services };
}

export async function resetDemo() {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query("DELETE FROM clinic.appointments");
    await seedAppointments(tx);
  });
}

export const todayInClinic = () => clinicDate(new Date());
