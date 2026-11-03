import { z } from "zod";

// Patient details, shared by the booking form and the AI assistant so both apply the same rules.
export const patientSchema = z.object({
  name: z.string().trim().min(2, "Please enter the patient's name").max(80),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Please enter a valid phone number"),
  email: z.union([z.literal(""), z.email("Please enter a valid email")]),
  notes: z.string().trim().max(500, "Please keep notes under 500 characters"),
});

/** Two phone numbers match if their last 7 digits do, so "+971 50 123 4567" matches "0501234567". */
export const samePhone = (a: string, b: string) => {
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  return da.length >= 7 && db.length >= 7 && da.slice(-7) === db.slice(-7);
};
