"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkCredentials, checkRefToken, endSession, refToken, requireAdmin, startSession } from "@/lib/auth";
import {
  bookAppointment,
  cancelAppointment,
  getDoctors,
  getServices,
  resetDemo,
  setStatus,
  SlotTakenError,
  STATUSES,
} from "@/lib/clinic";
import { isIsoDate } from "@/lib/time";

export interface FormState {
  error?: string;
  fields?: Record<string, string>;
}

const patientSchema = z.object({
  name: z.string().trim().min(2, "Please enter the patient's name").max(80),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Please enter a valid phone number"),
  email: z.union([z.literal(""), z.email("Please enter a valid email")]),
  notes: z.string().trim().max(500, "Please keep notes under 500 characters"),
});

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
