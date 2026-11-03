// The assistant never books or cancels by itself. It proposes, the server signs the proposal, and the
// patient's Confirm tap sends the signed token back. Editing the token in the browser breaks the signature.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type ProposalData =
  | {
      kind: "book";
      service: string; // service slug
      doctor: string; // doctor slug or "any"
      date: string;
      time: string;
      name: string;
      phone: string;
      email: string;
      notes: string;
      newPatient: boolean;
    }
  | { kind: "cancel"; ref: string; phone: string; date: string };

type Signed = ProposalData & { nonce: string; exp: number };

/** What the chat shows on the confirmation card. */
export interface Proposal {
  token: string;
  kind: ProposalData["kind"];
  title: string;
  lines: string[];
}

const TTL_MS = 15 * 60 * 1000;

const sign = (payload: string) =>
  createHmac("sha256", `proposal.${process.env.SESSION_SECRET || "dev-only-secret-change-me"}`).update(payload).digest("base64url");

export function signProposal(data: ProposalData, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...data, nonce: randomUUID(), exp: now + TTL_MS } satisfies Signed)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readProposal(token: string, now = Date.now()): Signed | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Signed;
    return data.exp > now ? data : null;
  } catch {
    return null;
  }
}
