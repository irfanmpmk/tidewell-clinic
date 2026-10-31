import type { Metadata } from "next";
import Link from "next/link";
import BookForm from "./BookForm";
import { aed, Avatar } from "@/components/ui";
import { availability, getDoctors, getServices, type Doctor, type Service } from "@/lib/clinic";
import { bookableDates } from "@/lib/schedule";
import { clinicDate, formatDate, formatTime, isIsoDate } from "@/lib/time";

export const metadata: Metadata = { title: "Book an appointment" };

const STEPS = ["Service", "Doctor", "Date & time", "Your details"];

function href(params: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  return `/book?${q}`;
}

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={`rounded-full px-3 py-1.5 font-semibold ${
            i === current ? "bg-teal-brand text-white" : i < current ? "bg-teal-soft text-teal-dark" : "bg-white text-ink-soft border border-line"
          }`}
        >
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

function Summary({ service, doctor, date, time, sp }: { service?: Service; doctor?: Doctor | "any"; date?: string; time?: string; sp: Record<string, string | undefined> }) {
  const rows = [
    service && { label: "Service", value: `${service.name} · ${service.duration_min} min`, change: href({}) },
    doctor && { label: "Doctor", value: doctor === "any" ? "First available doctor" : doctor.name, change: href({ service: sp.service }) },
    date && time && { label: "When", value: `${formatDate(date)}, ${formatTime(time)}`, change: href({ service: sp.service, doctor: sp.doctor, date }) },
  ].filter(Boolean) as { label: string; value: string; change: string }[];
  if (!rows.length) return null;
  return (
    <aside className="rounded-2xl bg-white border border-line p-5 space-y-3 self-start lg:sticky lg:top-24">
      <p className="font-bold">Your appointment</p>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3 text-sm">
          <div>
            <p className="text-xs text-ink-soft">{r.label}</p>
            <p className="font-semibold">{r.value}</p>
          </div>
          <Link href={r.change} className="text-teal-brand text-xs font-semibold hover:underline">Change</Link>
        </div>
      ))}
      {service && <p className="border-t border-line pt-3 text-sm font-semibold">{aed(service.price)} <span className="font-normal text-ink-soft">pay at the clinic</span></p>}
    </aside>
  );
}

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  const [services, doctors] = await Promise.all([getServices(), getDoctors()]);

  const service = services.find((s) => s.slug === sp.service);
  const specialists = service ? doctors.filter((d) => d.specialty === service.specialty) : [];
  const doctor: Doctor | "any" | undefined = sp.doctor === "any" ? "any" : specialists.find((d) => d.slug === sp.doctor);
  const chosenDoctors = doctor === "any" ? specialists : doctor ? [doctor] : [];

  // ---- Step 1: service
  if (!service) {
    return (
      <Page step={0} title="What do you need?">
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <Link key={s.slug} href={href({ service: s.slug })} className="rounded-2xl bg-white border border-line p-5 hover:border-teal-brand hover:shadow-sm transition">
              <p className="font-bold">{s.name}</p>
              <p className="text-sm text-ink-soft mt-1">{s.description}</p>
              <p className="text-xs text-teal-dark font-semibold mt-2">{s.duration_min} min · {aed(s.price)}</p>
            </Link>
          ))}
        </div>
      </Page>
    );
  }

  // ---- Step 2: doctor
  if (!doctor) {
    return (
      <Page step={1} title="Who would you like to see?" aside={<Summary service={service} sp={sp} />}>
        <div className="grid gap-3">
          {specialists.length > 1 && (
            <Link href={href({ service: service.slug, doctor: "any" })} className="rounded-2xl bg-teal-soft border border-teal-brand/30 p-5 hover:border-teal-brand transition">
              <p className="font-bold">First available doctor</p>
              <p className="text-sm text-ink-soft">See the most open times across our {specialists[0].title.toLowerCase()}s.</p>
            </Link>
          )}
          {specialists.map((d) => (
            <Link key={d.slug} href={href({ service: service.slug, doctor: d.slug })} className="rounded-2xl bg-white border border-line p-5 hover:border-teal-brand transition flex items-center gap-4">
              <Avatar doctor={d} />
              <div>
                <p className="font-bold">{d.name}</p>
                <p className="text-sm text-ink-soft">{d.title} · speaks {d.languages.join(", ")}</p>
              </div>
            </Link>
          ))}
        </div>
      </Page>
    );
  }

  // ---- Step 3: date and time
  const dates = bookableDates(chosenDoctors, clinicDate(new Date()));
  const date = sp.date && isIsoDate(sp.date) && dates.includes(sp.date) ? sp.date : dates[0];
  const slots = date ? await availability(service, chosenDoctors, date) : [];
  const time = sp.time && slots.some((s) => s.time === sp.time) ? sp.time : undefined;

  if (!time) {
    const groups = [
      ["Morning", slots.filter((s) => s.time < "12:00")],
      ["Afternoon", slots.filter((s) => s.time >= "12:00" && s.time < "17:00")],
      ["Evening", slots.filter((s) => s.time >= "17:00")],
    ] as const;
    return (
      <Page step={2} title="Pick a date and time" aside={<Summary service={service} doctor={doctor} sp={sp} />}>
        {sp.time && <p className="rounded-xl bg-coral/10 text-sm p-3 mb-4">That time is no longer available. Please choose another.</p>}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {dates.map((d) => (
            <Link
              key={d}
              href={href({ service: service.slug, doctor: sp.doctor, date: d })}
              className={`shrink-0 rounded-xl border px-4 py-2 text-center ${d === date ? "bg-teal-brand text-white border-teal-brand" : "bg-white border-line hover:border-teal-brand"}`}
            >
              <span className="block text-xs opacity-80">{formatDate(d, "short").split(" ")[0]}</span>
              <span className="block font-bold">{formatDate(d, "short").split(" ").slice(1).join(" ")}</span>
            </Link>
          ))}
        </div>
        <div className="mt-6 space-y-5">
          {slots.length === 0 && (
            <p className="rounded-2xl bg-white border border-line p-6 text-center text-ink-soft">
              Fully booked on {date ? formatDate(date) : "this day"}. Please try another day.
            </p>
          )}
          {groups.map(([label, list]) =>
            list.length ? (
              <div key={label}>
                <p className="text-sm font-semibold text-ink-soft mb-2">{label}</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {list.map((s) => (
                    <Link
                      key={s.time}
                      href={href({ service: service.slug, doctor: sp.doctor, date, time: s.time })}
                      className="rounded-xl bg-white border border-line py-2.5 text-center text-sm font-semibold hover:border-teal-brand hover:bg-teal-soft"
                    >
                      {formatTime(s.time)}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </Page>
    );
  }

  // ---- Step 4: patient details
  return (
    <Page step={3} title="Your details" aside={<Summary service={service} doctor={doctor} date={date} time={time} sp={sp} />}>
      <BookForm service={service.slug} doctor={sp.doctor!} date={date!} time={time} />
    </Page>
  );
}

function Page({ step, title, aside, children }: { step: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
      <Steps current={step} />
      <h1 className="mt-6 text-3xl font-extrabold">{title}</h1>
      <div className={`mt-6 grid gap-8 ${aside ? "lg:grid-cols-[1fr_300px]" : ""}`}>
        <div className="min-w-0">{children}</div>
        {aside}
      </div>
    </div>
  );
}
