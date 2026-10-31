import { checkRefToken } from "@/lib/auth";
import { getAppointment } from "@/lib/clinic";

// Calendar file (.ics) for Google Calendar, Outlook and Apple Calendar.
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

export async function GET(request: Request, { params }: RouteContext<"/appointment/[ref]/ics">) {
  const { ref } = await params;
  if (!checkRefToken(ref, new URL(request.url).searchParams.get("t") ?? undefined)) {
    return new Response("Not found", { status: 404 });
  }
  const a = await getAppointment(ref);
  if (!a) return new Response("Not found", { status: 404 });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tidewell Family Clinic//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${a.ref}@tidewell.demo`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(a.starts_at)}`,
    `DTEND:${stamp(a.ends_at)}`,
    `SUMMARY:${escape(`${a.service_name} with ${a.doctor_name}`)}`,
    `LOCATION:${escape("Tidewell Family Clinic, Al Wasl, Dubai")}`,
    `DESCRIPTION:${escape(`Booking reference ${a.ref}. Please arrive 10 minutes early.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Clinic appointment in 2 hours",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="tidewell-${a.ref}.ics"`,
    },
  });
}
