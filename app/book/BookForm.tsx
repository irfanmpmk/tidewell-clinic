"use client";

import { useActionState } from "react";
import { book, type FormState } from "@/app/actions";

const input = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-brand focus:ring-2 focus:ring-teal-soft";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default function BookForm(props: { service: string; doctor: string; date: string; time: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(book, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="rounded-2xl bg-white border border-line p-6 space-y-4" noValidate>
      {Object.entries(props).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <Field label="Patient's full name" error={f.name}>
        <input name="name" required autoComplete="name" className={input} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile number" error={f.phone}>
          <input name="phone" type="tel" required autoComplete="tel" placeholder="+971 5x xxx xxxx" className={input} />
        </Field>
        <Field label="Email (for your confirmation)" error={f.email}>
          <input name="email" type="email" autoComplete="email" className={input} />
        </Field>
      </div>
      <Field label="Anything we should know? (optional)" error={f.notes}>
        <textarea name="notes" rows={3} maxLength={500} placeholder="Symptoms, insurance provider, or booking for a child" className={input} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="newPatient" defaultChecked className="h-4 w-4 accent-teal-700" />
        This is my first visit to Tidewell
      </label>
      {state.error && <p className="rounded-xl bg-red-50 text-red-700 text-sm p-3">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-full bg-teal-brand text-white py-3.5 font-semibold hover:bg-teal-dark disabled:opacity-60">
        {pending ? "Booking…" : "Confirm booking"}
      </button>
      <p className="text-xs text-ink-soft text-center">No payment needed now. You can cancel online at any time before your visit.</p>
    </form>
  );
}
