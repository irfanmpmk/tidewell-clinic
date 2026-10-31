import Link from "next/link";
import { aed, Avatar, workDays } from "@/components/ui";
import { getDoctors, getServices, nextAvailable } from "@/lib/clinic";
import { formatDate, formatTime } from "@/lib/time";

const SPECIALTY_LABELS: Record<string, string> = {
  general: "General practice",
  dental: "Dental",
  paediatrics: "Children's health",
  skin: "Dermatology",
  physio: "Physiotherapy",
};

const FAQ = [
  ["Can I book for my child?", "Yes. Choose a children's service and enter your child's name as the patient; add your own name in the notes."],
  ["What if I need to cancel?", "Use the link on your confirmation page to cancel online up to the start of your appointment. It frees the time for someone else."],
  ["Do you accept insurance?", "We accept most major health insurance plans. Bring your insurance card and Emirates ID to your first visit."],
  ["How early should I arrive?", "Ten minutes before your appointment, or fifteen if it's your first visit, so we can register you."],
];

export default async function Home() {
  const [services, doctors, nextGp] = await Promise.all([getServices(), getDoctors(), nextAvailable("general-consultation")]);
  const groups = Object.keys(SPECIALTY_LABELS).map((key) => ({
    key,
    label: SPECIALTY_LABELS[key],
    services: services.filter((s) => s.specialty === key),
  }));

  return (
    <>
      {/* HERO */}
      <section className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid gap-10 lg:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              Care for the whole family, booked in a minute.
            </h1>
            <p className="mt-4 text-lg text-ink-soft max-w-xl">
              See a GP, dentist, paediatrician, dermatologist or physiotherapist. Pick a time that suits you and get an
              instant confirmation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="rounded-full bg-teal-brand text-white px-6 py-3.5 font-semibold hover:bg-teal-dark">
                Book an appointment
              </Link>
              <Link href="#services" className="rounded-full border border-line bg-white px-6 py-3.5 font-semibold hover:border-teal-brand">
                View services & prices
              </Link>
            </div>
            {nextGp && (
              <Link
                href={`/book?service=general-consultation&doctor=${nextGp.doctor.slug}&date=${nextGp.date}&time=${nextGp.time}`}
                className="mt-8 flex max-w-md items-center gap-4 border-l-4 border-teal-brand bg-mist px-4 py-3 hover:bg-teal-soft"
              >
                <span className="text-sm">
                  <span className="block text-ink-soft">Next free GP appointment</span>
                  <span className="font-bold">
                    {formatDate(nextGp.date)}, {formatTime(nextGp.time)} with {nextGp.doctor.name}
                  </span>
                </span>
                <span className="ml-auto text-teal-brand font-bold">→</span>
              </Link>
            )}
          </div>
          <div className="rounded-3xl bg-white border border-line p-6 shadow-sm space-y-4">
            <p className="font-semibold">Our doctors this week</p>
            {doctors.map((d) => (
              <div key={d.slug} className="flex items-center gap-3">
                <Avatar doctor={d} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{d.name}</p>
                  <p className="text-xs text-ink-soft">{d.title}</p>
                </div>
                <p className="text-xs text-ink-soft whitespace-nowrap">{workDays(d.work_days)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="max-w-6xl mx-auto px-4 sm:px-6 mt-16 scroll-mt-24">
        <h2 className="text-3xl font-extrabold">Services & prices</h2>
        <p className="mt-2 text-ink-soft">Fixed prices, shown before you book.</p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g.key} className="rounded-2xl bg-white border border-line p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-teal-brand">{g.label}</p>
              <ul className="mt-3 divide-y divide-line">
                {g.services.map((s) => (
                  <li key={s.slug} className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-ink-soft">{s.description}</p>
                      <p className="text-xs text-ink-soft mt-1">{s.duration_min} min · {aed(s.price)}</p>
                    </div>
                    <Link
                      href={`/book?service=${s.slug}`}
                      className="shrink-0 rounded-full bg-teal-soft text-teal-dark text-sm font-semibold px-4 py-2 hover:bg-teal-brand hover:text-white"
                    >
                      Book
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* DOCTORS */}
      <section id="doctors" className="max-w-6xl mx-auto px-4 sm:px-6 mt-16 scroll-mt-24">
        <h2 className="text-3xl font-extrabold">Meet our team</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((d) => (
            <div key={d.slug} className="rounded-2xl bg-white border border-line p-6 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar doctor={d} size="lg" />
                <div>
                  <p className="font-bold">{d.name}</p>
                  <p className="text-sm text-teal-brand font-semibold">{d.title}</p>
                </div>
              </div>
              <p className="text-sm text-ink-soft">{d.bio}</p>
              <p className="text-xs text-ink-soft">
                {workDays(d.work_days)} · {formatTime(d.start_time)} – {formatTime(d.end_time)}
                <br />
                Speaks {d.languages.join(", ")}
              </p>
              <Link
                href={`/book?service=${services.find((s) => s.specialty === d.specialty)?.slug}&doctor=${d.slug}`}
                className="mt-auto rounded-full border border-teal-brand text-teal-dark text-sm font-semibold px-4 py-2 text-center hover:bg-teal-brand hover:text-white"
              >
                Book with {d.name.replace(/^Dr\.\s*/, "").split(" ")[0]}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* VISIT + FAQ */}
      <section id="visit" className="max-w-6xl mx-auto px-4 sm:px-6 mt-16 grid gap-8 lg:grid-cols-2 scroll-mt-24">
        <div className="rounded-2xl bg-teal-brand text-white p-8 space-y-4">
          <h2 className="text-2xl font-extrabold">Visit us</h2>
          <p className="text-white/85">Ground floor, Al Wasl area, Dubai. Free parking for patients behind the building.</p>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-white/70">Mon – Sat</dt>
              <dd className="font-semibold">8 am – 8 pm</dd>
            </div>
            <div>
              <dt className="text-white/70">Sunday</dt>
              <dd className="font-semibold">Closed</dd>
            </div>
          </dl>
          <Link href="/book" className="inline-block rounded-full bg-white text-teal-dark font-semibold px-5 py-2.5 hover:bg-teal-soft">
            Book online
          </Link>
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-extrabold">Questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-xl bg-white border border-line p-4">
              <summary className="cursor-pointer font-semibold list-none flex justify-between gap-3">
                {q}
                <span className="text-teal-brand group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-2 text-sm text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
