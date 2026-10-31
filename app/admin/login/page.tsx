import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { DEMO_EMAIL, DEMO_PASSWORD, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Staff login", robots: { index: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  const usingDemo = !process.env.ADMIN_PASSWORD;
  return (
    <div className="max-w-sm mx-auto px-4 pt-16">
      <h1 className="text-3xl font-extrabold">Staff calendar</h1>
      <p className="text-sm text-ink-soft mt-2">See each doctor&apos;s day, check patients in and track no-shows.</p>
      {usingDemo && (
        <div className="mt-6 rounded-xl bg-teal-soft border border-line p-4 text-sm">
          <p className="font-semibold">Demo login</p>
          <p className="mt-1 font-mono text-xs">{DEMO_EMAIL}</p>
          <p className="font-mono text-xs">{DEMO_PASSWORD}</p>
        </div>
      )}
      <LoginForm defaultEmail={usingDemo ? DEMO_EMAIL : ""} />
    </div>
  );
}
