// Google Gemini as the assistant's model. The free tier needs no card; when its limits are reached the
// API returns 429 and the assistant tells the patient to use the booking form instead.
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Content, Model, Part } from "./agent";

// Free-tier models, tried in order. Free capacity is shared, so a model is sometimes "experiencing
// high demand" (503) or times out (504), and older models get retired (404); the next one usually answers.
// Measured in November 2026: 3.6 Flash with low thinking answered tool calls in 1–3 s while the newest
// Flash was overloaded. Override with GEMINI_MODELS=a,b,c.
export const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-flash-latest"];

const TIMEOUT_MS = 20_000;
const FALL_THROUGH = new Set([404, 429, 500, 503, 504]);
const isBusy = (err: unknown) => err instanceof ApiError && FALL_THROUGH.has(err.status);

export function geminiModel(opts: { apiKey: string; models?: string[]; system: string; declarations: object[] }): Model {
  // Fail fast instead of the SDK's default retries, so a busy model falls through to the next one quickly.
  const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  const models = opts.models?.length ? opts.models : DEFAULT_MODELS;

  return async (history: Content[]) => {
    let lastError: unknown;
    for (const model of models) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: history,
          config: {
            systemInstruction: opts.system,
            tools: [{ functionDeclarations: opts.declarations }],
            temperature: 0.3,
            // Booking chat needs quick, simple reasoning; low thinking cuts replies from tens of seconds to a few.
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        // The model turn is kept exactly as returned (including thought signatures), which Gemini needs
        // to continue a conversation that used tools.
        const parts = res.candidates?.[0]?.content?.parts as Part[] | undefined;
        return { role: "model", parts: parts?.length ? parts : [{ text: "Sorry, I didn't catch that. Could you say it another way?" }] };
      } catch (err) {
        if (!isBusy(err) && !isTimeout(err)) throw err;
        lastError = err;
      }
    }
    throw new ModelsBusyError(lastError);
  };
}

const isTimeout = (err: unknown) => err instanceof Error && /abort|timed? ?out/i.test(`${err.name} ${err.message}`);

/** Every model was over capacity or over the free-tier limit. */
export class ModelsBusyError extends Error {
  constructor(readonly lastError: unknown) {
    super("All assistant models are busy or over the free-tier limit");
  }
}
