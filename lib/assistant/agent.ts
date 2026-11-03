// The agent loop: ask the model, run any tools it calls, feed the results back, repeat until it answers
// in plain text. Provider-neutral: `Model` is any function that turns a history into the next model turn,
// so Gemini can be swapped for Claude or OpenAI, and tests can use a scripted fake.
import type { z } from "zod";
import type { Proposal } from "./proposal.ts";

// Message shapes follow the Gemini API, which is the provider wired up in production.
export interface Part {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
}
export interface Content {
  role: "user" | "model";
  parts: Part[];
}
export type Model = (history: Content[]) => Promise<Content>;

export interface ToolResult {
  output: unknown;
  summary: string; // one line for the step log, without patient details
  proposal?: Proposal;
}

export interface Tool<A = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<A>;
  run(args: A): Promise<ToolResult>;
}

/** A failure the patient should hear about, e.g. "that time is no longer free". */
export class ToolError extends Error {}

export interface Step {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  ms: number;
}

const PATIENT_FIELDS = new Set(["patient_name", "phone", "email", "notes"]);
/** Tool arguments as they are logged: patient details never reach the log. */
export const redact = (args: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(args).map(([k, v]) => [k, PATIENT_FIELDS.has(k) ? "[redacted]" : v]));

export const GAVE_UP =
  "Sorry, I couldn't finish that. Could you ask in a simpler way? You can also book directly with the booking form.";

export async function runAgent(opts: { history: Content[]; model: Model; tools: Tool<never>[]; maxSteps?: number }) {
  const history = [...opts.history];
  const steps: Step[] = [];
  let proposal: Proposal | undefined;

  for (let turn = 0; turn < (opts.maxSteps ?? 6); turn++) {
    const reply = await opts.model(history);
    history.push(reply);
    const calls = reply.parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = reply.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      return { history, text: text || GAVE_UP, steps, proposal };
    }

    const responses: Part[] = [];
    for (const { functionCall: call } of calls) {
      const name = call!.name ?? "";
      const args = call!.args ?? {};
      const tool = opts.tools.find((t) => t.name === name) as Tool<unknown> | undefined;
      const started = Date.now();
      let response: Record<string, unknown>;
      let step: Omit<Step, "ms">;
      const parsed = tool?.schema.safeParse(args);
      if (!tool) {
        response = { error: `Unknown tool "${name}".` };
        step = { tool: name, args: redact(args), ok: false, summary: "Unknown tool" };
      } else if (!parsed!.success) {
        const problem = parsed!.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        response = { error: `Invalid arguments. ${problem}` };
        step = { tool: name, args: redact(args), ok: false, summary: `Rejected arguments: ${problem}` };
      } else {
        try {
          const result = await tool.run(parsed!.data);
          if (result.proposal) proposal = result.proposal;
          response = { output: result.output };
          step = { tool: name, args: redact(args), ok: true, summary: result.summary };
        } catch (err) {
          // Expected failures go back to the model as data so it can explain or try another way.
          // Anything else is logged here and the model only hears that something went wrong.
          if (!(err instanceof ToolError)) console.error(`assistant tool ${name} failed`, err);
          const message = err instanceof ToolError ? err.message : "Something went wrong on our side. Please try again.";
          response = { error: message };
          step = { tool: name, args: redact(args), ok: false, summary: message };
        }
      }
      steps.push({ ...step, ms: Date.now() - started });
      responses.push({ functionResponse: { id: call!.id, name, response } });
    }
    history.push({ role: "user", parts: responses });
  }
  return { history, text: GAVE_UP, steps, proposal };
}
