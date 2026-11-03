// The agent loop and confirmation tokens, tested with a scripted fake model (no API key or network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { GAVE_UP, runAgent, ToolError, type Content, type Model, type Tool } from "./agent.ts";
import { saidByPatient } from "./guards.ts";
import { readProposal, signProposal } from "./proposal.ts";

/** A fake model that replays the given turns in order and records what it was shown. */
function scripted(turns: Content["parts"][]) {
  const seen: Content[][] = [];
  const model: Model = async (history) => {
    seen.push(structuredClone(history));
    const parts = turns.shift();
    if (!parts) throw new Error("model called more times than scripted");
    return { role: "model", parts };
  };
  return { model, seen };
}

const call = (name: string, args: Record<string, unknown>, id = name) => ({ functionCall: { id, name, args } });
const user = (text: string): Content => ({ role: "user", parts: [{ text }] });

const slotsTool: Tool<{ date: string }> = {
  name: "find_slots",
  description: "",
  schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async run({ date }) {
    if (date === "2026-11-01") throw new ToolError("The clinic is closed on Sunday.");
    if (date === "2026-11-09") throw new Error("connection refused at 10.0.0.5");
    return { output: { times: ["09:00", "09:30"] }, summary: `2 free times on ${date}` };
  },
};
const bookTool: Tool<{ patient_name: string; phone: string }> = {
  name: "propose_booking",
  description: "",
  schema: z.object({ patient_name: z.string(), phone: z.string() }),
  async run() {
    return { output: { status: "waiting_for_patient" }, summary: "Proposed", proposal: { token: "t", kind: "book", title: "Confirm", lines: [] } };
  },
};
const tools = [slotsTool, bookTool] as Tool<never>[];

test("runs the tool the model asks for and returns its final answer", async () => {
  const { model, seen } = scripted([[call("find_slots", { date: "2026-11-02" })], [{ text: "I have 9:00 am or 9:30 am." }]]);
  const result = await runAgent({ history: [user("Monday please")], model, tools });

  assert.equal(result.text, "I have 9:00 am or 9:30 am.");
  assert.deepEqual(result.steps.map((s) => [s.tool, s.ok, s.summary]), [["find_slots", true, "2 free times on 2026-11-02"]]);
  // The tool result goes back to the model as a function response matching the call id.
  const fed = seen[1].at(-1)!;
  assert.equal(fed.role, "user");
  assert.deepEqual(fed.parts[0].functionResponse, { id: "find_slots", name: "find_slots", response: { output: { times: ["09:00", "09:30"] } } });
});

test("invalid arguments are rejected before the tool runs, and the model can recover", async () => {
  const { model, seen } = scripted([
    [call("find_slots", { date: "next monday" })],
    [call("find_slots", { date: "2026-11-02" })],
    [{ text: "Done" }],
  ]);
  const result = await runAgent({ history: [user("hi")], model, tools });

  assert.equal(result.steps[0].ok, false);
  assert.match(String(seen[1].at(-1)!.parts[0].functionResponse!.response!.error), /Invalid arguments. date:/);
  assert.equal(result.steps[1].ok, true);
  assert.equal(result.text, "Done");
});

test("expected tool errors reach the model; unexpected ones are hidden", async () => {
  const { model, seen } = scripted([
    [call("find_slots", { date: "2026-11-01" }, "a"), call("find_slots", { date: "2026-11-09" }, "b")],
    [{ text: "Sorry" }],
  ]);
  const original = console.error;
  console.error = () => {};
  try {
    await runAgent({ history: [user("hi")], model, tools });
  } finally {
    console.error = original;
  }
  const [closed, crashed] = seen[1].at(-1)!.parts.map((p) => p.functionResponse!.response!.error);
  assert.equal(closed, "The clinic is closed on Sunday.");
  assert.doesNotMatch(String(crashed), /10\.0\.0\.5/);
});

test("unknown tools are reported back instead of crashing", async () => {
  const { model } = scripted([[call("delete_everything", {})], [{ text: "I can't do that." }]]);
  const result = await runAgent({ history: [user("hi")], model, tools });
  assert.deepEqual([result.steps[0].ok, result.text], [false, "I can't do that."]);
});

test("patient details are redacted from the step log", async () => {
  const { model } = scripted([[call("propose_booking", { patient_name: "Aisha Khan", phone: "+971 50 000 1234" })], [{ text: "Please confirm." }]]);
  const result = await runAgent({ history: [user("book")], model, tools });
  assert.deepEqual(result.steps[0].args, { patient_name: "[redacted]", phone: "[redacted]" });
  assert.equal(result.proposal?.token, "t");
});

test("gives up after the step limit instead of looping forever", async () => {
  const { model } = scripted(Array.from({ length: 3 }, () => [call("find_slots", { date: "2026-11-02" })]));
  const result = await runAgent({ history: [user("hi")], model, tools, maxSteps: 3 });
  assert.equal(result.text, GAVE_UP);
  assert.equal(result.steps.length, 3);
});

test("thought parts are not shown to the patient", async () => {
  const { model } = scripted([[{ text: "internal reasoning", thought: true }, { text: "Hello!" }]]);
  assert.equal((await runAgent({ history: [user("hi")], model, tools })).text, "Hello!");
});

test("patient details must have been typed by the patient", () => {
  const said = "I'd like a check-up\nAisha Test, phone 050 000 1111";
  assert.doesNotThrow(() => saidByPatient(said, { name: "Aisha Test", phone: "+971 50 000 1111" }));
  assert.throws(() => saidByPatient(said, { name: "Patient", phone: "555 0000" }), /full name and phone number/);
  assert.throws(() => saidByPatient("ref abc234", { ref: "ABC234", phone: "0500001111" }), /phone number/);
  assert.doesNotThrow(() => saidByPatient("ref abc234, 0500001111", { ref: "ABC234", phone: "0500001111" }));
});

test("signed proposals can't be edited and expire", () => {
  const data = { kind: "cancel" as const, ref: "ABC234", phone: "+971500001234", date: "2026-11-04" };
  const token = signProposal(data, 1_000);
  assert.deepEqual({ ...readProposal(token, 2_000), nonce: undefined, exp: undefined }, { ...data, nonce: undefined, exp: undefined });

  const [payload, sig] = token.split(".");
  const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), ref: "ZZZ999" })).toString("base64url");
  assert.equal(readProposal(`${edited}.${sig}`, 2_000), null);
  assert.equal(readProposal(token, 1_000 + 16 * 60 * 1000), null); // older than 15 minutes
  assert.equal(readProposal("garbage", 2_000), null);
});
