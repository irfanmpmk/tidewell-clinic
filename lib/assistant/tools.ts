// What the assistant can do. Read tools answer from the live database; the two "propose" tools check
// everything the booking form checks, then return a signed proposal that only the patient can confirm.
import { z } from "zod";
import { aed, workDays } from "@/components/ui";
import { availability, getAppointment, getDoctors, getServices, STATUS_LABELS, todayInClinic, type Doctor, type Service } from "@/lib/clinic";
import { bookableDates, BOOKING_WINDOW_DAYS, worksOn } from "@/lib/schedule";
import { addDays, clinicDate, clinicMinutes, formatDate, formatTime, fromMinutes, isIsoDate, toMinutes } from "@/lib/time";
import { patientSchema, samePhone } from "@/lib/validation";
import { ToolError, type Tool, type ToolResult } from "./agent";
import { saidByPatient } from "./guards";
import { signProposal } from "./proposal";

const tool = <S extends z.ZodType>(t: { name: string; description: string; schema: S; run(args: z.infer<S>): Promise<ToolResult> }) =>
  t as unknown as Tool<never>;

async function catalog() {
  const [services, doctors] = await Promise.all([getServices(), getDoctors()]);
  return { services, doctors };
}

// Models sometimes pass a display name ("Dr. Karim Aziz") where an id is expected; accept either.
const key = (s: string) => s.toLowerCase().replace(/^dr\.?\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function resolve(services: Service[], doctors: Doctor[], serviceId: string, doctorId: string) {
  const service = services.find((s) => s.slug === serviceId || key(s.name) === key(serviceId));
  if (!service) throw new ToolError(`Unknown service "${serviceId}". Use an id from list_services.`);
  const team = doctors.filter((d) => d.specialty === service.specialty);
  if (doctorId === "any") return { service, team, doctor: undefined };
  const doctor = doctors.find((d) => d.slug === doctorId || key(d.name) === key(doctorId));
  if (!doctor) throw new ToolError(`Unknown doctor "${doctorId}". Use an id from list_doctors.`);
  if (doctor.specialty !== service.specialty) {
    throw new ToolError(`${doctor.name} doesn't offer ${service.name}. Doctors who do: ${team.map((d) => d.name).join(", ")}.`);
  }
  return { service, team: [doctor], doctor };
}

function checkDate(date: string) {
  const today = todayInClinic();
  if (!isIsoDate(date)) throw new ToolError(`"${date}" is not a date in YYYY-MM-DD form.`);
  if (date < today) throw new ToolError(`${formatDate(date)} is in the past.`);
  if (date > addDays(today, BOOKING_WINDOW_DAYS - 1)) {
    throw new ToolError(`Bookings open ${BOOKING_WINDOW_DAYS} days ahead; the last bookable day is ${formatDate(addDays(today, BOOKING_WINDOW_DAYS - 1))}.`);
  }
}

const PARTS_OF_DAY = { morning: [0, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 24 * 60] } as const;
type PartOfDay = keyof typeof PARTS_OF_DAY;

async function freeTimes(service: Service, team: Doctor[], date: string, part?: PartOfDay) {
  const slots = await availability(service, team, date);
  const [from, to] = part ? PARTS_OF_DAY[part] : [0, 24 * 60];
  return slots
    .filter((s) => toMinutes(s.time) >= from && toMinutes(s.time) < to)
    .map((s) => ({ time: s.time, label: formatTime(s.time), doctors: s.doctorIds.map((id) => team.find((d) => d.id === id)!.name) }));
}

const serviceArg = z.string().describe("Service id from list_services, e.g. general-consultation");
const doctorArg = z.string().default("any").describe('Doctor id from list_doctors, or "any" for the first available doctor');
const refArg = z.string().trim().toUpperCase().length(6).describe("6-character booking reference");
const phoneArg = z.string().describe("Phone number the appointment was booked with");

/** The clinic's tools for one conversation; `patientText` is everything the patient has typed so far. */
export const clinicTools = (patientText: string): Tool<never>[] => [
  tool({
    name: "list_services",
    description: "List the clinic's services with ids, length in minutes, price in AED and which doctors provide them.",
    schema: z.object({}),
    async run() {
      const { services, doctors } = await catalog();
      return {
        summary: `Listed ${services.length} services`,
        output: services.map((s) => ({
          id: s.slug,
          name: s.name,
          minutes: s.duration_min,
          price: aed(s.price),
          about: s.description,
          doctors: doctors.filter((d) => d.specialty === s.specialty).map((d) => d.name),
        })),
      };
    },
  }),

  tool({
    name: "list_doctors",
    description: "List the doctors with ids, specialty, languages spoken, working days and hours.",
    schema: z.object({}),
    async run() {
      const { doctors } = await catalog();
      return {
        summary: `Listed ${doctors.length} doctors`,
        output: doctors.map((d) => ({
          id: d.slug,
          name: d.name,
          title: d.title,
          languages: d.languages,
          days: workDays(d.work_days),
          hours: `${formatTime(d.start_time)} – ${formatTime(d.end_time)}`,
          about: d.bio,
        })),
      };
    },
  }),

  tool({
    name: "find_slots",
    description:
      "Find free appointment times. With a date, returns that day's free times; without one, returns the next few days that have free times. Always use this before suggesting a time.",
    schema: z.object({
      service: serviceArg,
      doctor: doctorArg,
      date: z.string().optional().describe("YYYY-MM-DD in clinic time. Omit to search the coming days."),
      part_of_day: z.enum(["morning", "afternoon", "evening"]).optional().describe("Only times before 12 pm, 12–5 pm, or after 5 pm"),
    }),
    async run({ service: serviceId, doctor: doctorId, date, part_of_day }) {
      const { services, doctors } = await catalog();
      const { service, team, doctor } = resolve(services, doctors, serviceId, doctorId);
      const who = doctor?.name ?? "any doctor";

      if (date) {
        checkDate(date);
        if (!team.some((d) => worksOn(d, date))) {
          return {
            summary: `${who} not working on ${date}`,
            output: { date: formatDate(date), times: [], note: doctor ? `${doctor.name} doesn't work on that day.` : "The clinic is closed that day." },
          };
        }
        const times = await freeTimes(service, team, date, part_of_day);
        return {
          summary: `${times.length} free times for ${service.name} with ${who} on ${date}`,
          output: { date: formatDate(date), total: times.length, times: times.slice(0, 12) },
        };
      }

      const days: { date: string; label: string; times: Awaited<ReturnType<typeof freeTimes>> }[] = [];
      for (const d of bookableDates(team, todayInClinic())) {
        const times = await freeTimes(service, team, d, part_of_day);
        if (times.length) days.push({ date: d, label: formatDate(d), times: times.slice(0, 6) });
        if (days.length === 3) break;
      }
      return {
        summary: `Searched the next ${BOOKING_WINDOW_DAYS} days for ${service.name} with ${who}: ${days.length} days with free times`,
        output: days.length ? { days } : { days, note: `No free times in the next ${BOOKING_WINDOW_DAYS} days.` },
      };
    },
  }),

  tool({
    name: "propose_booking",
    description:
      "Prepare a booking once the patient has chosen a time and given their name and phone. Shows the patient a confirmation card; nothing is booked until they tap Confirm.",
    schema: z.object({
      service: serviceArg,
      doctor: doctorArg,
      date: z.string().describe("YYYY-MM-DD"),
      time: z.string().regex(/^\d{2}:\d{2}$/).describe("HH:MM, 24-hour, exactly as returned by find_slots"),
      patient_name: z.string(),
      phone: z.string(),
      email: z.string().default("").describe("Optional"),
      notes: z.string().default("").describe("Optional, e.g. reason for the visit"),
      new_patient: z.boolean().describe("True if this is the patient's first visit to Tidewell"),
    }),
    async run(a) {
      const { services, doctors } = await catalog();
      const { service, team, doctor } = resolve(services, doctors, a.service, a.doctor);
      checkDate(a.date);
      saidByPatient(patientText, { name: a.patient_name, phone: a.phone });
      const patient = patientSchema.safeParse({ name: a.patient_name, phone: a.phone, email: a.email, notes: a.notes });
      if (!patient.success) throw new ToolError(patient.error.issues.map((i) => i.message).join("; "));
      const slot = (await freeTimes(service, team, a.date)).find((s) => s.time === a.time);
      if (!slot) throw new ToolError(`${formatTime(a.time)} on ${formatDate(a.date)} isn't free. Call find_slots for current times.`);

      const p = patient.data;
      const token = signProposal({
        kind: "book",
        service: service.slug,
        doctor: a.doctor,
        date: a.date,
        time: a.time,
        name: p.name,
        phone: p.phone,
        email: p.email,
        notes: p.notes,
        newPatient: a.new_patient,
      });
      return {
        summary: `Proposed ${service.name} on ${a.date} at ${a.time}; waiting for the patient to confirm`,
        proposal: {
          token,
          kind: "book",
          title: "Confirm your appointment",
          lines: [
            `${service.name} · ${service.duration_min} min`,
            doctor ? doctor.name : `First available: ${slot.doctors.join(" or ")}`,
            `${formatDate(a.date)} at ${formatTime(a.time)}`,
            `${p.name}${a.new_patient ? " (first visit)" : ""} · ${p.phone}`,
            `${aed(service.price)}, pay at the clinic`,
          ],
        },
        output: {
          status: "waiting_for_patient",
          message: "A confirmation card is now on the patient's screen. It is NOT booked yet: ask them to check the details and tap Confirm.",
        },
      };
    },
  }),

  tool({
    name: "find_appointment",
    description: "Look up an existing appointment. Needs the booking reference and the phone number it was booked with.",
    schema: z.object({ ref: refArg, phone: phoneArg }),
    async run({ ref, phone }) {
      saidByPatient(patientText, { ref, phone });
      const a = await getAppointment(ref);
      if (!a || !samePhone(a.phone, phone)) throw new ToolError("No appointment matches that reference and phone number.");
      return {
        summary: `Found an appointment (${STATUS_LABELS[a.status]})`,
        output: {
          ref: a.ref,
          service: a.service_name,
          doctor: a.doctor_name,
          date: formatDate(clinicDate(a.starts_at)),
          time: formatTime(fromMinutes(clinicMinutes(a.starts_at))),
          status: STATUS_LABELS[a.status],
          can_cancel_online: a.upcoming,
        },
      };
    },
  }),

  tool({
    name: "propose_cancellation",
    description: "Prepare cancelling an upcoming appointment. Shows the patient a confirmation card; nothing changes until they tap Confirm.",
    schema: z.object({ ref: refArg, phone: phoneArg }),
    async run({ ref, phone }) {
      saidByPatient(patientText, { ref, phone });
      const a = await getAppointment(ref);
      if (!a || !samePhone(a.phone, phone)) throw new ToolError("No appointment matches that reference and phone number.");
      if (!a.upcoming) throw new ToolError(`This appointment can't be cancelled online: it is ${STATUS_LABELS[a.status].toLowerCase()} or already past.`);
      const date = clinicDate(a.starts_at);
      return {
        summary: "Proposed a cancellation; waiting for the patient to confirm",
        proposal: {
          token: signProposal({ kind: "cancel", ref: a.ref, phone, date }),
          kind: "cancel",
          title: "Cancel this appointment?",
          lines: [
            `${a.service_name} with ${a.doctor_name}`,
            `${formatDate(date)} at ${formatTime(fromMinutes(clinicMinutes(a.starts_at)))}`,
            `Reference ${a.ref}`,
          ],
        },
        output: {
          status: "waiting_for_patient",
          message: "A cancellation card is now on the patient's screen. Nothing is cancelled until they tap Confirm.",
        },
      };
    },
  }),
];

/** JSON Schema for each tool's arguments, in the form the model API expects. */
export function toolDeclarations(tools: Tool<never>[] = clinicTools("")) {
  return tools.map((t) => {
    const schema = z.toJSONSchema(t.schema as z.ZodType, { io: "input" }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, parametersJsonSchema: schema };
  });
}
