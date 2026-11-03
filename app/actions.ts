"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readProposal } from "@/lib/assistant/proposal";
import { checkCredentials, checkRefToken, endSession, refToken, requireAdmin, startSession } from "@/lib/auth";
import {
  bookAppointment,
  cancelAppointment,
  claimConfirmation,
  getAppointment,
  getDoctors,
  getServices,
  resetDemo,
  setStatus,
  SlotTakenError,
  STATUSES,
} from "@/lib/clinic";
import { formatDate, formatTime, isIsoDate } from "@/lib/time";
import { patientSchema, samePhone } from "@/lib/validation";

export interface FormState {
  error?: string;
  fields?: Record<string, string>;
}

export async function book(_prev: FormState, form: FormData): Promise<FormState> {
  if (form.get("company")) redirect("/"); // honeypot

  const serviceSlug = String(form.get("service") ?? "");
  const doctorSlug = String(form.get("doctor") ?? "");
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  const [services, doctors] = await Promise.all([getServices(), getDoctors()]);
  const service = services.find((s) => s.slug === serviceSlug);
  const candidates = doctors.filter((d) => d.specialty === service?.specialty && (doctorSlug === "any" || d.slug === doctorSlug));
  if (!service || !candidates.length || !isIsoDate(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { error: "This booking link is incomplete. Please start again." };
  }

  const parsed = patientSchema.safeParse({
    name: String(form.get("name") ?? ""),
    phone: String(form.get("phone") ?? ""),
    email: String(form.get("email") ?? ""),
    notes: String(form.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return {
      error: "Please check the highlighted fields.",
      fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }

  let ref: string;
  try {
    ref = await bookAppointment({
      service,
      doctorIds: candidates.map((d) => d.id),
      date,
      time,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      notes: parsed.data.notes,
      newPatient: form.get("newPatient") === "on",
    });
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return { error: "Sorry, that time was just booked by someone else. Please pick another time." };
    }
    throw err;
  }
  revalidatePath("/admin");
  redirect(`/appointment/${ref}?t=${refToken(ref)}&new=1`);
}

export async function cancelByPatient(form: FormData) {
  const ref = String(form.get("ref") ?? "");
  const token = String(form.get("t") ?? "");
  if (!checkRefToken(ref, token)) return;
  await cancelAppointment(ref);
  revalidatePath("/admin");
  redirect(`/appointment/${ref}?t=${token}`);
}

// ---------------------------------------------------------------- AI assistant

export type ConfirmResult = { ok: true; message: string; link?: string; note: string } | { ok: false; error: string };

/**
 * The assistant only proposes bookings and cancellations; this runs when the patient taps Confirm.
 * The proposal is HMAC-signed by the server, so nothing in it can be edited in the browser, and it is
 * re-validated here exactly like the booking form.
 */
export async function confirmAssistantProposal(token: string): Promise<ConfirmResult> {
  const proposal = readProposal(token);
  if (!proposal) return { ok: false, error: "This confirmation has expired. Please ask the assistant again." };
  if (!(await claimConfirmation(proposal.nonce))) return { ok: false, error: "This was already confirmed." };

  if (proposal.kind === "cancel") {
    const appt = await getAppointment(proposal.ref);
    if (!appt || !samePhone(appt.phone, proposal.phone) || !appt.upcoming) {
      return { ok: false, error: "This appointment can no longer be cancelled online." };
    }
    await cancelAppointment(appt.ref);
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Cancelled: ${appt.service_name} on ${formatDate(proposal.date)}. The time is free for someone else now.`,
      note: `[Patient confirmed the cancellation of ${appt.ref}. It is now cancelled.]`,
    };
  }

  const [services, doctors] = await Promise.all([getServices(), getDoctors()]);
  const service = services.find((s) => s.slug === proposal.service);
  const candidates = doctors.filter((d) => d.specialty === service?.specialty && (proposal.doctor === "any" || d.slug === proposal.doctor));
  const patient = patientSchema.safeParse({ name: proposal.name, phone: proposal.phone, email: proposal.email, notes: proposal.notes });
  if (!service || !candidates.length || !patient.success) return { ok: false, error: "Something in this booking is no longer valid." };

  try {
    const ref = await bookAppointment({
      service,
      doctorIds: candidates.map((d) => d.id),
      date: proposal.date,
      time: proposal.time,
      name: patient.data.name,
      phone: patient.data.phone,
      email: patient.data.email || null,
      notes: patient.data.notes,
      newPatient: proposal.newPatient,
    });
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Booked: ${service.name}, ${formatDate(proposal.date)} at ${formatTime(proposal.time)}. Your reference is ${ref}.`,
      link: `/appointment/${ref}?t=${refToken(ref)}`,
      note: `[Patient confirmed. Booked with reference ${ref}.]`,
    };
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return { ok: false, error: "Sorry, that time was just booked by someone else. Ask the assistant for another time." };
    }
    throw err;
  }
}

// ---------------------------------------------------------------- Staff

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  if (!checkCredentials(String(form.get("email") ?? ""), String(form.get("password") ?? ""))) {
    return { error: "Wrong email or password." };
  }
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

export async function updateStatus(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const status = String(form.get("status"));
  if (!Number.isInteger(id) || !(STATUSES as readonly string[]).includes(status)) return;
  await setStatus(id, status as (typeof STATUSES)[number]);
  revalidatePath("/admin");
}

export async function resetDemoData() {
  await requireAdmin();
  await resetDemo();
  revalidatePath("/admin");
  redirect("/admin");
}
