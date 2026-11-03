import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Tidewell Family Clinic — Book a doctor in Dubai", template: "%s · Tidewell Family Clinic" },
  description: "Book GP, dental, children's, skin and physiotherapy appointments online. A demo clinic booking system with live availability and a staff calendar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <div className="bg-ink text-white/85 text-xs text-center px-4 py-1.5">
          Demo project: fictional clinic, doctors and patients — built by{" "}
          <a href="https://irfanmpmk.xyz" className="underline underline-offset-2 hover:text-white">Mohamed Irfan</a>
        </div>
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-brand text-white">+</span>
              Tidewell
            </Link>
            <nav className="flex items-center gap-4 sm:gap-5 text-sm font-medium whitespace-nowrap">
              <Link href="/#services" className="hidden sm:inline hover:text-teal-brand">Services</Link>
              <Link href="/#doctors" className="hidden sm:inline hover:text-teal-brand">Doctors</Link>
              <Link href="/#visit" className="hidden sm:inline hover:text-teal-brand">Visit us</Link>
              <Link href="/assistant" className="hover:text-teal-brand">
                <span className="sm:hidden">Assistant</span>
                <span className="hidden sm:inline">Ask the assistant</span>
              </Link>
              <Link href="/book" className="rounded-full bg-teal-brand text-white px-4 py-2 hover:bg-teal-dark">
                Book appointment
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line bg-white mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-6 sm:grid-cols-3 text-sm text-ink-soft">
            <div>
              <p className="font-bold text-ink">Tidewell Family Clinic</p>
              <p className="mt-2">GP, dental, children&apos;s health, dermatology and physiotherapy under one roof.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-ink">Opening hours</p>
              <p>Monday – Saturday: 8 am – 8 pm</p>
              <p>Sunday: closed</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-ink">About this demo</p>
              <p>The clinic, doctors and patients are fictional.</p>
              <Link href="/admin" className="block underline underline-offset-2 hover:text-ink">Staff calendar (demo login)</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
