import type { Metadata } from "next";
import Link from "next/link";
import Chat from "./Chat";

export const metadata: Metadata = {
  title: "Booking assistant",
  description: "Ask Tidewell's AI assistant about doctors and free times, and book or cancel an appointment in a conversation.",
};

export default function AssistantPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <h1 className="text-3xl font-extrabold">Booking assistant</h1>
        <p className="mt-2 mb-6 text-ink-soft">Tell it what you need in your own words. It checks real availability and books with you.</p>
        <Chat />
      </div>

      <aside className="space-y-4 text-sm lg:pt-20">
        <div className="rounded-2xl bg-white border border-line p-5 space-y-3">
          <p className="font-bold">How it works</p>
          <p className="text-ink-soft">
            It reads the same live schedule as the{" "}
            <Link href="/book" className="text-teal-brand font-semibold hover:underline">booking form</Link>, so the times
            it offers are really free.
          </p>
          <p className="text-ink-soft">
            It can&apos;t book or cancel on its own. It prepares the change and you confirm it with a tap.
          </p>
          <p className="text-ink-soft">
            Each step it takes is recorded for clinic staff, without your name or phone number.
          </p>
        </div>
        <div className="rounded-2xl border border-line p-5 text-ink-soft">
          <p className="font-semibold text-ink">Demo note</p>
          <p className="mt-1">
            This assistant runs on Google Gemini&apos;s free tier, so please don&apos;t type real personal details. Made-up
            names and numbers work fine.
          </p>
        </div>
      </aside>
    </div>
  );
}
