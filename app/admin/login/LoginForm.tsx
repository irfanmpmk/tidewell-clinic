"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/actions";

const input = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-brand";

export default function LoginForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Email</span>
        <input name="email" type="email" required defaultValue={defaultEmail} autoComplete="username" className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className={input} />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-teal-brand text-white py-3 text-sm font-semibold hover:bg-teal-dark disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
