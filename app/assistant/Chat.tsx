"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { confirmAssistantProposal } from "@/app/actions";
import type { Content } from "@/lib/assistant/agent";
import type { Proposal } from "@/lib/assistant/proposal";

type StepView = { tool: string; ok: boolean; summary: string };
type NewMessage =
  | { role: "patient"; text: string }
  | { role: "assistant"; text: string; steps: StepView[]; proposal?: Proposal; settled?: "confirmed" | "replaced" }
  | { role: "notice"; text: string; ok: boolean; link?: string };
type Message = NewMessage & { id: number };

const STEP_LABELS: Record<string, string> = {
  list_services: "Read the service list",
  list_doctors: "Read the doctor list",
  find_slots: "Checked free times",
  propose_booking: "Prepared a booking",
  find_appointment: "Looked up an appointment",
  propose_cancellation: "Prepared a cancellation",
};

const SUGGESTIONS = [
  "Book a dental check-up next week",
  "Which doctors speak Arabic?",
  "My son needs a vaccination on Saturday morning",
  "I want to cancel my appointment",
];

const GREETING: Message = {
  id: 0,
  role: "assistant",
  text: "Hello! I can help you find a doctor, check free times, and book or cancel an appointment. What do you need?",
  steps: [],
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [history, setHistory] = useState<Content[]>([]);
  const [note, setNote] = useState<string>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, startConfirm] = useTransition();
  const [conversation] = useState(() => crypto.randomUUID());
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const add = (m: NewMessage) => setMessages((all) => [...all, { ...m, id: nextId.current++ }]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    add({ role: "patient", text: message });
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversation, message, note, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        add({ role: "notice", text: data.text, ok: false });
        return;
      }
      setHistory(data.history);
      setNote(undefined);
      // A new proposal replaces any older card that wasn't confirmed.
      setMessages((all) => all.map((m) => (m.role === "assistant" && m.proposal && !m.settled && data.proposal ? { ...m, settled: "replaced" } : m)));
      add({ role: "assistant", text: data.text, steps: data.steps, proposal: data.proposal });
    } catch {
      add({ role: "notice", text: "Couldn't reach the assistant. Check your connection and try again.", ok: false });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function confirm(id: number, token: string) {
    startConfirm(async () => {
      const result = await confirmAssistantProposal(token);
      setMessages((all) => all.map((m) => (m.id === id && m.role === "assistant" ? { ...m, settled: "confirmed" } : m)));
      if (result.ok) {
        add({ role: "notice", text: result.message, ok: true, link: result.link });
        setNote(result.note);
      } else {
        add({ role: "notice", text: result.error, ok: false });
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-line flex flex-col overflow-hidden">
      <div ref={listRef} className="h-[60vh] min-h-[420px] overflow-y-auto p-4 sm:p-6 space-y-4" aria-live="polite">
        {messages.map((m) =>
          m.role === "patient" ? (
            <p key={m.id} className="ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-sm bg-teal-brand text-white px-4 py-2.5 whitespace-pre-wrap">
              {m.text}
            </p>
          ) : m.role === "notice" ? (
            <div
              key={m.id}
              className={`rounded-xl px-4 py-3 text-sm ${m.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-red-50 border border-red-200 text-red-800"}`}
            >
              <p>{m.text}</p>
              {m.link && (
                <Link href={m.link} className="mt-1 inline-block font-semibold underline underline-offset-2">
                  View, add to calendar or cancel
                </Link>
              )}
            </div>
          ) : (
            <div key={m.id} className="max-w-[90%] space-y-2">
              <div className="rounded-2xl rounded-bl-sm bg-mist px-4 py-2.5">
                <Rich text={m.text} />
              </div>
              {m.steps.length > 0 && (
                <details className="text-xs text-ink-soft">
                  <summary className="cursor-pointer select-none">
                    {m.steps.length} {m.steps.length === 1 ? "step" : "steps"}: {[...new Set(m.steps.map((s) => STEP_LABELS[s.tool] ?? s.tool))].join(", ")}
                  </summary>
                  <ol className="mt-2 ml-4 list-decimal space-y-1">
                    {m.steps.map((s, i) => (
                      <li key={i} className={s.ok ? "" : "text-red-700"}>
                        {s.summary}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {m.proposal && (
                <div className={`rounded-xl border-2 p-4 ${m.settled ? "border-line opacity-70" : "border-teal-brand"}`}>
                  <p className="font-bold">{m.proposal.title}</p>
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {m.proposal.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  {m.settled ? (
                    <p className="mt-3 text-xs text-ink-soft">{m.settled === "confirmed" ? "Confirmed" : "Replaced by a newer proposal"}</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => confirm(m.id, m.proposal!.token)}
                        disabled={confirming}
                        className={`rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${m.proposal.kind === "cancel" ? "bg-red-700 hover:bg-red-800" : "bg-teal-brand hover:bg-teal-dark"}`}
                      >
                        {confirming ? "Confirming…" : m.proposal.kind === "cancel" ? "Yes, cancel it" : "Confirm booking"}
                      </button>
                      <button
                        onClick={() => {
                          setInput("I'd like to change ");
                          inputRef.current?.focus();
                        }}
                        className="rounded-full border border-line px-4 py-2 text-sm hover:border-teal-brand"
                      >
                        Change something
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {busy && <p className="w-fit rounded-2xl bg-mist px-4 py-2.5 text-ink-soft animate-pulse">Checking…</p>}
        {messages.length === 1 && !busy && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3.5 py-1.5 text-sm hover:border-teal-brand hover:text-teal-dark">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-line p-3 flex gap-2"
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message
        </label>
        <input
          id="assistant-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={600}
          placeholder="Ask about doctors, times or your booking"
          autoComplete="off"
          className="flex-1 min-w-0 rounded-full border border-line px-4 py-2.5 focus:outline-none focus:border-teal-brand"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-full bg-teal-brand text-white px-5 py-2.5 font-semibold hover:bg-teal-dark disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

/** Light formatting for model replies: paragraphs, "- " lists and **bold**. */
function Rich({ text }: { text: string }) {
  const blocks: ({ p: string } | { list: string[] })[] = [];
  for (const line of text.split("\n")) {
    const item = line.match(/^\s*[-*•]\s+(.*)/);
    const last = blocks.at(-1);
    if (item) {
      if (last && "list" in last) last.list.push(item[1]);
      else blocks.push({ list: [item[1]] });
    } else if (line.trim()) {
      blocks.push({ p: line });
    }
  }
  const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
  return (
    <div className="space-y-2">
      {blocks.map((b, i) =>
        "p" in b ? (
          <p key={i}>{bold(b.p)}</p>
        ) : (
          <ul key={i} className="list-disc ml-5 space-y-0.5">
            {b.list.map((li, j) => (
              <li key={j}>{bold(li)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
