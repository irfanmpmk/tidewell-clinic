import type { Doctor } from "@/lib/clinic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

export function Avatar({ doctor, size = "md" }: { doctor: Pick<Doctor, "name" | "color">; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-12 w-12 text-sm", lg: "h-16 w-16 text-lg" };
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${sizes[size]}`}
      style={{ backgroundColor: doctor.color }}
      aria-hidden
    >
      {initials(doctor.name)}
    </span>
  );
}

/** "Mon – Sat" style summary of working days. */
export function workDays(days: number[]) {
  const sorted = [...days].sort();
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  return contiguous && sorted.length > 2 ? `${DAYS[sorted[0]]} – ${DAYS[sorted.at(-1)!]}` : sorted.map((d) => DAYS[d]).join(", ");
}

export const aed = (n: number) => `AED ${n.toLocaleString("en-AE")}`;
