import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Single demo admin, configured by env. Visitors get the demo login on the login page.
export const DEMO_EMAIL = "demo@tidewell.test";
export const DEMO_PASSWORD = "demo1234";

const COOKIE = "admin_session";
const MAX_AGE = 60 * 60 * 8;

function secret() {
  return process.env.SESSION_SECRET || "dev-only-secret-change-me";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkCredentials(email: string, password: string) {
  const expectedEmail = process.env.ADMIN_EMAIL || DEMO_EMAIL;
  const expectedPassword = process.env.ADMIN_PASSWORD || DEMO_PASSWORD;
  return safeEqual(email.trim().toLowerCase(), expectedEmail.toLowerCase()) && safeEqual(password, expectedPassword);
}

export async function startSession() {
  const expires = Date.now() + MAX_AGE * 1000;
  const payload = `admin.${expires}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const i = value.lastIndexOf(".");
  const payload = value.slice(0, i);
  const expires = Number(payload.split(".")[1]);
  return safeEqual(value.slice(i + 1), sign(payload)) && expires > Date.now();
}

/** Call at the top of every admin page and admin Server Action. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

// Patients manage a booking through a link carrying this token, so a booking reference
// alone (which could be guessed) is not enough to view or cancel someone's appointment.
export function refToken(ref: string) {
  return sign(`appt.${ref}`).slice(0, 22);
}

export function checkRefToken(ref: string, token: string | undefined) {
  return !!token && safeEqual(token, refToken(ref));
}
