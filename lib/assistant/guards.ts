import { ToolError } from "./agent.ts";

/**
 * Patient details must come from the patient. Models occasionally fill in a placeholder name or number
 * to complete a tool call, so the server checks the details against what the patient actually typed.
 */
export function saidByPatient(patientText: string, detail: { name?: string; phone?: string; ref?: string }) {
  const text = patientText.toLowerCase();
  const digits = patientText.replace(/\D/g, "");
  const missing: string[] = [];
  if (detail.name !== undefined && !detail.name.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w))) {
    missing.push("full name");
  }
  if (detail.phone !== undefined) {
    const phone = detail.phone.replace(/\D/g, "");
    if (phone.length < 7 || !digits.includes(phone.slice(-7))) missing.push("phone number");
  }
  if (detail.ref !== undefined && !text.includes(detail.ref.toLowerCase())) missing.push("booking reference");
  if (missing.length) {
    throw new ToolError(`The patient hasn't given their ${missing.join(" and ")} in this conversation. Ask them for it; never make it up.`);
  }
}
