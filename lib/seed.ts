// Fictional clinic data. Appointments are generated around "today", so the demo always looks current.
import type { Tx } from "./db";
import { CLOSED_WEEKDAYS, LUNCH } from "./schedule.ts";
import { addDays, clinicDate, clinicInstant, fromMinutes, toMinutes, weekday } from "./time.ts";

export const doctors = [
  { slug: "leena-thomas", name: "Dr. Leena Thomas", title: "General Practitioner", specialty: "general", color: "#0f766e",
    bio: "Family doctor with 12 years' experience in preventive care, chronic conditions and travel health.",
    languages: ["English", "Malayalam", "Hindi"], work_days: [1, 2, 3, 4, 5, 6], start_time: "09:00", end_time: "17:00" },
  { slug: "karim-aziz", name: "Dr. Karim Aziz", title: "Dentist", specialty: "dental", color: "#2563eb",
    bio: "General and cosmetic dentistry, with a gentle approach for nervous patients.",
    languages: ["English", "Arabic", "French"], work_days: [1, 2, 3, 4, 5], start_time: "10:00", end_time: "19:00" },
  { slug: "neha-varma", name: "Dr. Neha Varma", title: "Paediatrician", specialty: "paediatrics", color: "#c026d3",
    bio: "Child health from newborn to teens: check-ups, vaccinations and growth monitoring.",
    languages: ["English", "Hindi"], work_days: [1, 3, 4, 6], start_time: "09:00", end_time: "15:00" },
  { slug: "daniel-moore", name: "Dr. Daniel Moore", title: "Dermatologist", specialty: "skin", color: "#ea580c",
    bio: "Skin, hair and nail conditions, acne care and mole checks.",
    languages: ["English"], work_days: [2, 4, 6], start_time: "12:00", end_time: "20:00" },
  { slug: "sara-lim", name: "Sara Lim", title: "Physiotherapist", specialty: "physio", color: "#65a30d",
    bio: "Sports injuries, back and neck pain, and post-surgery rehabilitation.",
    languages: ["English", "Tagalog"], work_days: [1, 2, 3, 4, 5, 6], start_time: "08:00", end_time: "16:00" },
];

export const services = [
  { slug: "general-consultation", name: "General consultation", specialty: "general", duration_min: 15, price: 250,
    description: "See a GP for a new or ongoing health concern." },
  { slug: "health-check", name: "Full health check-up", specialty: "general", duration_min: 45, price: 600,
    description: "Examination, blood pressure, BMI and a review of your blood results." },
  { slug: "dental-checkup", name: "Dental check-up & cleaning", specialty: "dental", duration_min: 45, price: 350,
    description: "Examination, scale and polish, and advice on keeping your teeth healthy." },
  { slug: "teeth-whitening", name: "Teeth whitening", specialty: "dental", duration_min: 60, price: 1200,
    description: "In-clinic whitening session with a shade check before and after." },
  { slug: "child-consultation", name: "Child consultation", specialty: "paediatrics", duration_min: 30, price: 300,
    description: "For illness, development questions or a routine check." },
  { slug: "vaccination", name: "Vaccination", specialty: "paediatrics", duration_min: 15, price: 150,
    description: "Routine childhood vaccines (vaccine cost charged separately)." },
  { slug: "skin-consultation", name: "Skin consultation", specialty: "skin", duration_min: 30, price: 450,
    description: "Assessment of a skin, hair or nail concern with a treatment plan." },
  { slug: "physio-session", name: "Physiotherapy session", specialty: "physio", duration_min: 45, price: 400,
    description: "Assessment and treatment for pain, injury or rehabilitation." },
];

const FIRST = ["Aisha", "Rahul", "Maria", "Omar", "Priya", "James", "Fatima", "Arjun", "Elena", "Yusuf", "Grace", "Ravi", "Noura", "Kevin", "Anita", "Hassan", "Sofia", "Vikram", "Layla", "Tom"];
const LAST = ["Khan", "Menon", "Santos", "Haddad", "Nair", "Wilson", "Rahman", "Pillai", "Petrova", "Ali", "Chen", "Iyer", "Saeed", "Joseph", "Das", "Farouk", "Rossi", "Shah", "Mansour", "Becker"];

// Small deterministic PRNG so every reset produces the same pattern.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRef(random: () => number = Math.random) {
  return Array.from({ length: 6 }, () => REF_CHARS[Math.floor(random() * REF_CHARS.length)]).join("");
}

export async function seedCatalog(tx: Tx) {
  for (const d of doctors) {
    await tx.query(
      `INSERT INTO clinic.doctors (slug, name, title, specialty, bio, languages, work_days, start_time, end_time, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (slug) DO NOTHING`,
      [d.slug, d.name, d.title, d.specialty, d.bio, d.languages, d.work_days, d.start_time, d.end_time, d.color],
    );
  }
  for (const s of services) {
    await tx.query(
      `INSERT INTO clinic.services (slug, name, specialty, duration_min, price, description)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (slug) DO NOTHING`,
      [s.slug, s.name, s.specialty, s.duration_min, s.price, s.description],
    );
  }
}

/** Roughly one-third-full schedules from 7 days ago to 7 days ahead, with realistic statuses. */
export async function seedAppointments(tx: Tx, now = new Date()) {
  const random = rng(20261101);
  const docs = await tx.query<{ id: number; specialty: string; work_days: number[]; start_time: string; end_time: string }>(
    "SELECT id, specialty, work_days, start_time, end_time FROM clinic.doctors ORDER BY id",
  );
  const svcs = await tx.query<{ id: number; specialty: string; duration_min: number }>(
    "SELECT id, specialty, duration_min FROM clinic.services",
  );
  const today = clinicDate(now);
  const lunch = [toMinutes(LUNCH.start), toMinutes(LUNCH.end)];
  const rows: unknown[][] = [];

  for (let offset = -7; offset <= 7; offset++) {
    const date = addDays(today, offset);
    if (CLOSED_WEEKDAYS.includes(weekday(date))) continue;
    for (const d of docs) {
      if (!d.work_days.includes(weekday(date))) continue;
      const mine = svcs.filter((s) => s.specialty === d.specialty);
      let t = toMinutes(d.start_time);
      while (t < toMinutes(d.end_time)) {
        const s = mine[Math.floor(random() * mine.length)];
        const end = t + s.duration_min;
        const fits = end <= toMinutes(d.end_time) && !(t < lunch[1] && end > lunch[0]);
        if (!fits || random() > 0.38) {
          t += 15;
          continue;
        }
        const starts = clinicInstant(date, fromMinutes(t));
        const past = starts.getTime() < now.getTime();
        const r = random();
        const status = past ? (r < 0.8 ? "completed" : r < 0.9 ? "no_show" : "cancelled") : r < 0.92 ? "booked" : "cancelled";
        const first = FIRST[Math.floor(random() * FIRST.length)];
        const last = LAST[Math.floor(random() * LAST.length)];
        rows.push([
          newRef(random), d.id, s.id, starts, new Date(starts.getTime() + s.duration_min * 60_000),
          `${first} ${last}`, `+971 50 000 ${String(1000 + Math.floor(random() * 9000))}`,
          random() < 0.5 ? `${first.toLowerCase()}@example.com` : null, random() < 0.4, status,
        ]);
        t = end;
      }
    }
  }
  // 100 rows per statement: a handful of round trips instead of hundreds.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const values = chunk.map((_, r) => `(${Array.from({ length: 10 }, (_, c) => `$${r * 10 + c + 1}`).join(",")})`).join(",");
    await tx.query(
      `INSERT INTO clinic.appointments (ref, doctor_id, service_id, starts_at, ends_at, patient_name, phone, email, new_patient, status)
       VALUES ${values} ON CONFLICT (ref) DO NOTHING`,
      chunk.flat(),
    );
  }
  return rows.length;
}
