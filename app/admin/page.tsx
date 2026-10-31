import type { Metadata } from "next";
import Link from "next/link";
import { logout, resetDemoData, updateStatus } from "@/app/actions";
import { aed, Avatar } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { appointmentsOn, clinicStats, getDoctors, STATUS_LABELS, todayInClinic, type Appointment, type Status } from "@/lib/clinic";
import { LUNCH, worksOn } from "@/lib/schedule";
import { addDays, clinicMinutes, formatDate, formatTime, fromMinutes, isIsoDate, toMinutes } from "@/lib/time";

export const metadata: Metadata = { title: "Staff calendar", robots: { index: false } };

const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const ROW_PX = 22; // height of 15 minutes

const STATUS_STYLE: Record<Status, string> = {
  booked: "bg-white",
  checked_in: "bg-amber-50",
  completed: "bg-emerald-50",
  no_show: "bg-red-50 opacity-80",
  cancelled: "bg-gray-50 opacity-50 line-through",
};
const STATUS_BADGE: Record<Status, string> = {
  booked: "bg-sky-100 text-sky-800",
  checked_in: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  no_show: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

// The next sensible actions for each status, shown as buttons.
const NEXT: Record<Status, Status[]> = {
  booked: ["checked_in", "no_show", "cancelled"],
  checked_in: ["completed"],
  completed: [],
  no_show: ["booked"],
  cancelled: ["booked"],
};

const top = (min: number) => ((min - DAY_START) / 15) * ROW_PX;

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const raw = (await searchParams).date;
  const today = todayInClinic();
  const date = typeof raw === "string" && isIsoDate(raw) ? raw : today;
  const [doctors, appts, stats] = await Promise.all([getDoctors(), appointmentsOn(date), clinicStats(today)]);

  const noShowRate = stats.past ? Math.round((stats.no_shows / stats.past) * 100) : 0;
  const active = appts.filter((a) => a.status !== "cancelled");
  const cards = [
    ["Today", stats.today, "appointments"],
    ["Next 7 days", stats.upcoming_week, "booked"],
    ["No-show rate", `${noShowRate}%`, "last 7 days"],
    ["New patients", stats.new_patients, "seen in the last 7 days"],
  ];
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Staff calendar</h1>
        <div className="flex gap-2 text-sm">
          <form action={resetDemoData}>
            <button className="rounded-full border border-line bg-white px-4 py-2 hover:border-teal-brand" title="Regenerate the sample appointments">
              Reset demo data
            </button>
          </form>
          <form action={logout}>
            <button className="rounded-full bg-ink text-white px-4 py-2 hover:bg-ink/85">Sign out</button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl bg-white border border-line p-5">
            <p className="text-xs font-semibold text-ink-soft">{label}</p>
            <p className="text-3xl font-extrabold mt-1">{value}</p>
            <p className="text-xs text-ink-soft">{hint}</p>
          </div>
        ))}
      </div>

      {/* Day navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin?date=${addDays(date, -1)}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-teal-brand" aria-label="Previous day">←</Link>
        <Link href="/admin" className={`rounded-full px-3 py-1.5 text-sm ${date === today ? "bg-teal-brand text-white" : "border border-line bg-white hover:border-teal-brand"}`}>Today</Link>
        <Link href={`/admin?date=${addDays(date, 1)}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-teal-brand" aria-label="Next day">→</Link>
        <p className="ml-2 font-bold">{formatDate(date)}</p>
        <p className="text-sm text-ink-soft">· {active.length} appointments</p>
      </div>

      {/* Calendar: one column per doctor */}
      <div className="rounded-2xl bg-white border border-line overflow-x-auto">
        <div className="grid min-w-[860px]" style={{ gridTemplateColumns: `56px repeat(${doctors.length}, minmax(150px, 1fr))` }}>
          <div className="border-b border-line" />
          {doctors.map((d) => (
            <div key={d.id} className="border-b border-l border-line p-3 flex items-center gap-2">
              <Avatar doctor={d} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{d.name}</p>
                <p className="text-[11px] text-ink-soft">{worksOn(d, date) ? `${formatTime(d.start_time)} – ${formatTime(d.end_time)}` : "Not working"}</p>
              </div>
            </div>
          ))}

          <div className="relative" style={{ height: top(DAY_END) }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-ink-soft" style={{ top: top(h) }}>
                {formatTime(fromMinutes(h)).replace(":00", "")}
              </span>
            ))}
          </div>
          {doctors.map((d) => {
            const working = worksOn(d, date);
            const open = toMinutes(d.start_time);
            const close = toMinutes(d.end_time);
            return (
              <div key={d.id} className="relative border-l border-line" style={{ height: top(DAY_END) }}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: top(h) }} />
                ))}
                {/* Off hours and lunch shaded */}
                {!working ? (
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#f3f8f8,#f3f8f8_6px,#fff_6px,#fff_12px)]" />
                ) : (
                  <>
                    <div className="absolute inset-x-0 top-0 bg-mist" style={{ height: top(open) }} />
                    <div className="absolute inset-x-0 bg-mist" style={{ top: top(close), bottom: 0 }} />
                    <div className="absolute inset-x-0 bg-mist flex items-center justify-center text-[10px] text-ink-soft" style={{ top: top(toMinutes(LUNCH.start)), height: top(toMinutes(LUNCH.end)) - top(toMinutes(LUNCH.start)) }}>
                      Lunch
                    </div>
                  </>
                )}
                {appts
                  .filter((a) => a.doctor_id === d.id)
                  .map((a) => {
                    const start = clinicMinutes(a.starts_at);
                    return (
                      <a
                        key={a.id}
                        href={`#appt-${a.id}`}
                        className={`absolute left-1 right-1 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-[11px] leading-tight shadow-sm hover:z-10 hover:shadow-md ${STATUS_STYLE[a.status]}`}
                        style={{ top: top(start) + 1, height: (a.duration_min / 15) * ROW_PX - 2, borderLeftColor: d.color }}
                        title={`${formatTime(fromMinutes(start))} ${a.patient_name} · ${a.service_name} · ${STATUS_LABELS[a.status]}`}
                      >
                        <span className="font-semibold">{formatTime(fromMinutes(start))}</span> {a.patient_name}
                        {a.duration_min >= 30 && <span className="block text-ink-soft truncate">{a.service_name}</span>}
                      </a>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Day list with actions */}
        <div className="rounded-2xl bg-white border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-soft border-b border-line">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Doctor · service</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {appts.map((a) => (
                <Row key={a.id} a={a} />
              ))}
              {appts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-soft">No appointments on this day.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="rounded-2xl bg-white border border-line p-5 self-start">
          <p className="font-bold">Busiest services</p>
          <p className="text-xs text-ink-soft">Completed, last 7 days</p>
          <ol className="mt-3 space-y-2 text-sm">
            {stats.services.map((s) => (
              <li key={s.name} className="flex justify-between gap-3">
                <span>{s.name}</span>
                <span className="text-ink-soft whitespace-nowrap">{s.count} · {aed(s.revenue)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function Row({ a }: { a: Appointment }) {
  return (
    <tr id={`appt-${a.id}`} className="target:bg-teal-soft scroll-mt-24">
      <td className="px-4 py-3 whitespace-nowrap font-semibold">{formatTime(fromMinutes(clinicMinutes(a.starts_at)))}</td>
      <td className="px-4 py-3">
        <p className="font-semibold">
          {a.patient_name}
          {a.new_patient && <span className="ml-2 rounded bg-coral/15 text-[10px] px-1.5 py-0.5 text-ink">NEW</span>}
        </p>
        <p className="text-xs text-ink-soft whitespace-nowrap">{a.phone} · {a.ref}</p>
        {a.notes && <p className="text-xs text-ink-soft mt-1 max-w-64">“{a.notes}”</p>}
      </td>
      <td className="px-4 py-3">
        <p>{a.doctor_name}</p>
        <p className="text-xs text-ink-soft">{a.service_name} · {a.duration_min} min</p>
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STATUS_BADGE[a.status]}`}>{STATUS_LABELS[a.status]}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {NEXT[a.status].map((s) => (
            <form key={s} action={updateStatus}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value={s} />
              <button className="rounded-full border border-line px-2.5 py-1 text-xs whitespace-nowrap hover:border-teal-brand hover:text-teal-dark">
                {s === "booked" ? "Restore" : STATUS_LABELS[s]}
              </button>
            </form>
          ))}
        </div>
      </td>
    </tr>
  );
}
