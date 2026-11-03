import { createHash } from "node:crypto";
import { z } from "zod";
import { runAgent, type Content } from "@/lib/assistant/agent";
import { geminiModel, ModelsBusyError } from "@/lib/assistant/gemini";
import { systemPrompt } from "@/lib/assistant/prompt";
import { clinicTools, toolDeclarations } from "@/lib/assistant/tools";
import { allowAssistantRequest, logAssistantSteps, todayInClinic } from "@/lib/clinic";

export const maxDuration = 60;

const MESSAGES_PER_HOUR = 30;

// The browser keeps the conversation and sends it back each turn. It can only ever influence what
// the model reads: every action still goes through the tools' checks and the patient's Confirm tap.
const bodySchema = z.object({
  conversation: z.string().regex(/^[\w-]{8,64}$/),
  message: z.string().trim().min(1).max(600),
  note: z.string().max(200).optional(), // e.g. "[Patient confirmed. Booked with reference ABC123.]"
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), parts: z.array(z.record(z.string(), z.unknown())).max(20) }))
    .max(60),
});

const reply = (text: string, status = 200, extra: object = {}) => Response.json({ text, ...extra }, { status });

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 200_000) return reply("This conversation is too long. Please start a new one.", 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) return reply("Sorry, something went wrong. Please refresh the page.", 400);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return reply("The assistant isn't switched on yet. Please use the booking form for now.", 503);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const visitor = createHash("sha256").update(`${ip}.${process.env.SESSION_SECRET ?? ""}`).digest("hex").slice(0, 32);
  if (!(await allowAssistantRequest(visitor, MESSAGES_PER_HOUR))) {
    return reply("You've sent a lot of messages this hour. Please try again later, or use the booking form.", 429);
  }

  const { conversation, message, note, history } = body.data;
  const userTurn: Content = { role: "user", parts: note ? [{ text: note }, { text: message }] : [{ text: message }] };
  const model = geminiModel({
    apiKey,
    models: process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean), // optional override
    system: systemPrompt(todayInClinic()),
    declarations: toolDeclarations(),
  });

  const turns = [...(history as Content[]), userTurn];
  const patientText = turns
    .filter((c) => c.role === "user")
    .flatMap((c) => c.parts.map((p) => (typeof p.text === "string" ? p.text : "")))
    .join("\n");

  try {
    const result = await runAgent({ history: turns, model, tools: clinicTools(patientText) });
    await logAssistantSteps(conversation, result.steps);
    return Response.json({
      text: result.text,
      history: result.history,
      steps: result.steps.map(({ tool, ok, summary }) => ({ tool, ok, summary })),
      proposal: result.proposal,
    });
  } catch (err) {
    if (err instanceof ModelsBusyError) {
      return reply("The assistant is busy right now (it runs on a free AI plan with daily limits). Please use the booking form, or try again later.", 503);
    }
    console.error("assistant failed", err);
    return reply("Sorry, the assistant ran into a problem. Please try again, or use the booking form.", 500);
  }
}
