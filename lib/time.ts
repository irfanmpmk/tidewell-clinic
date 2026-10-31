// Clinic-time helpers. Dubai is UTC+4 all year (no daylight saving), so a fixed offset is exact.
export const TIME_ZONE = "Asia/Dubai";
const OFFSET = "+04:00";
const OFFSET_MS = 4 * 60 * 60 * 1000;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 'YYYY-MM-DD' of an instant, in clinic time. */
export const clinicDate = (d: Date) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);

/** Minutes since midnight of an instant, in clinic time. */
export const clinicMinutes = (d: Date) => {
  const local = new Date(d.getTime() + OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

/** The instant a clinic-time date and 'HH:MM' refer to. */
export const clinicInstant = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00${OFFSET}`);

/** 0 = Sunday ... 6 = Saturday. */
export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

export const formatDate = (date: string, style: "long" | "short" = "long") =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
  });

export const formatTime = (hhmm: string) => {
  const m = toMinutes(hhmm);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
