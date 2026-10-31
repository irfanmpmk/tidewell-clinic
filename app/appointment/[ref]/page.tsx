import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelByPatient } from "@/app/actions";
import { aed, Avatar } from "@/components/ui";
import { checkRefToken } from "@/lib/auth";
import { getAppointment, STATUS_LABELS } from "@/lib/clinic";
import { clinicDate, clinicMinutes, formatDate, formatTime, fromMinutes } from "@/lib/time";

export const metadata: Metadata = { title: "Your appointment", robots: { index: false } };

export default async function AppointmentPage({ params, searchParams }: PageProps<"/appointment/[ref]">) {
  const { ref } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : undefined;
  // Without a valid token we don't reveal whether the reference exists.
  if (!checkRefToken(ref, token)) notFound();
  const a = await getAppointment(ref);
  if (!a) notFound();

  const date = clinicDate(a.starts_at);
  const time = fromMinutes(clinicMinutes(a.starts_at));
  const isNew = sp.new === "1" && a.status === "booked";
  const upcoming = a.upcoming;
  const shareText = `My appointment at Tidewell Family Clinic: ${a.service_name} with ${a.doctor_name}, ${formatDate(date)} at ${formatTime(time)}. Ref ${a.ref}`;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-10">
      {isNew && (
        <div className="text-center mb-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 text-2xl">✓</div>
          <h1 className="mt-4 text-3xl font-extrabold">You&apos;re booked!</h1>
          <p className="mt-2 text-ink-soft">Save this page: it&apos;s your link to view or cancel the appointment.</p>
        </div>
      )}
      {!isNew && <h1 className="text-3xl font-extrabold mb-6">Your appointment</h1>}

      <div className="rounded-2xl bg-white border border-line overflow-hidden">
        <div className="bg-teal-brand text-white p-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-white/75 text-sm">{formatDate(date)}</p>
            <p className="text-3xl font-extrabold">{formatTime(time)}</p>
          </div>
          <div className="text-right">
            <p className="text-white/75 text-xs">Booking reference</p>
            <p className="font-mono text-xl font-bold tracking-widest">{a.ref}</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar doctor={{ name: a.doctor_name, color: a.doctor_color }} />
            <div>
              <p className="font-bold">{a.doctor_name}</p>
              <p className="text-sm text-ink-soft">{a.doctor_title}</p>
            </div>
            <span
              className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
                a.status === "cancelled" ? "bg-gray-100 text-gray-600" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {STATUS_LABELS[a.status]}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-ink-soft">Service</dt>
              <dd className="font-semibold">{a.service_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Length</dt>
              <dd className="font-semibold">{a.duration_min} minutes</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Patient</dt>
              <dd className="font-semibold">{a.patient_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Price</dt>
              <dd className="font-semibold">{aed(a.price)}, pay at the clinic</dd>
            </div>
          </dl>
          <p className="text-sm text-ink-soft">
            Please arrive {a.new_patient ? "15" : "10"} minutes early{a.new_patient ? " to register, and bring your Emirates ID and insurance card" : ""}.
          </p>

          {upcoming && (
            <div className="flex flex-wrap gap-2 pt-2">
              <a href={`/appointment/${a.ref}/ics?t=${token}`} className="rounded-full bg-teal-soft text-teal-dark text-sm font-semibold px-4 py-2 hover:bg-teal-brand hover:text-white">
                Add to calendar
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#25D366] text-white text-sm font-semibold px-4 py-2 hover:brightness-110"
              >
                Share on WhatsApp
              </a>
              <form action={cancelByPatient} className="ml-auto">
                <input type="hidden" name="ref" value={a.ref} />
                <input type="hidden" name="t" value={token} />
                <button className="rounded-full border border-red-200 text-red-700 text-sm font-semibold px-4 py-2 hover:bg-red-50">
                  Cancel appointment
                </button>
              </form>
            </div>
          )}
          {a.status === "cancelled" && (
            <p className="rounded-xl bg-mist p-3 text-sm">
              This appointment is cancelled. <Link href="/book" className="text-teal-brand font-semibold hover:underline">Book a new time</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
