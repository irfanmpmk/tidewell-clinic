# Tidewell Family Clinic — appointment booking demo

Online booking for a multi-doctor clinic, with real availability rules and a staff calendar.
**The clinic, doctors and patients are fictional.**

## What it does

**Patients**
- Choose a service, a doctor (or the first available one), a date and a time
- Only genuinely free times are offered: each doctor's working days and hours, lunch break, the service's length, existing bookings, Sunday closing, and a one-hour minimum notice
- Instant confirmation with a booking reference, an "Add to calendar" file (.ics) and WhatsApp sharing
- A private link to view or cancel the appointment (signed, so a reference alone can't be used to see someone's booking)

**Staff** (`/admin`, demo login shown on the login page)
- Day calendar with a column per doctor, shaded off-hours and lunch, colour-coded statuses
- One-click status flow: Booked → Checked in → Completed, or No-show / Cancelled
- Stats: today's appointments, upcoming week, no-show rate, new patients, busiest services
- "Reset demo data" regenerates two weeks of sample appointments around today
- Activity log of the AI assistant's steps

**AI booking assistant** (`/assistant`)
- Patients ask in plain words ("dental check-up next Tuesday morning", "which doctors speak Arabic?") and the assistant looks up services, doctors and free times from the live database
- It is an agent with six tools: `list_services`, `list_doctors`, `find_slots`, `propose_booking`, `find_appointment`, `propose_cancellation`
- **It can't change anything by itself.** The two `propose_*` tools run every check the booking form runs, then return a confirmation card; the booking or cancellation happens only when the patient taps Confirm

## How the assistant is kept safe

- **Human confirmation.** Proposals are HMAC-signed by the server, expire after 15 minutes and can be confirmed once (`assistant_confirmations`), so they can't be edited or replayed from the browser.
- **No invented patient details.** Language models sometimes fill a tool call with a placeholder name or number. The server checks that the name, phone number and booking reference in a tool call were actually typed by the patient (`lib/assistant/guards.ts`) and sends the model back to ask if not.
- **Lookups need proof.** Finding or cancelling an appointment needs the booking reference and the phone number it was booked with.
- **Prompt injection can't widen access.** Patient messages can only change what the model reads; every tool validates its arguments (Zod) and enforces the same rules as the rest of the app.
- **Private logs.** Each tool call is logged for staff with timings, but patient names, phones, emails and notes are redacted before logging.
- **Limits.** 30 messages per visitor per hour; at most six model turns per message.

The agent loop is provider-neutral (`lib/assistant/agent.ts` takes any `history → next turn` function). Production uses Google Gemini's free tier through `lib/assistant/gemini.ts`, with a fallback chain across free models and low thinking for fast replies. When every model is busy, patients are pointed to the booking form. The loop, guards and signed proposals are unit tested with a scripted fake model, so the tests need no API key.

## How double bookings are prevented

Each booking runs in one database transaction that locks the candidate doctors' rows (`SELECT … FOR UPDATE`), re-reads their appointments for that day, re-checks the requested time against the same rules used to show availability, and only then inserts. If two people submit the same slot at once, the second sees "that time was just booked" and picks another.

The availability rules live in `lib/schedule.ts` with no database or framework code, and are unit tested:

```bash
npm test      # Node's built-in test runner
```

## Stack

Next.js 16 (App Router, Server Components, Server Actions, Route Handlers) · TypeScript · Tailwind CSS 4 · PostgreSQL (Neon in production, PGlite locally) · Zod · Google Gemini (function calling)

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Without `DATABASE_URL` the app uses PGlite (Postgres in WebAssembly, stored in `.pglite/`). Tables live in a `clinic` schema and are created with demo data on first start.

## Environment

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon). Omit to use local PGlite. |
| `SESSION_SECRET` | Long random string that signs the staff session and patients' appointment links. **Set this in production.** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Real staff login. When unset, the demo login is used and shown on the login page. |
| `GEMINI_API_KEY` | Google AI Studio key for the booking assistant (the free tier works). Without it, the assistant page asks patients to use the booking form. |
| `GEMINI_MODELS` | Optional comma-separated list of models to try in order. Defaults to `gemini-3.6-flash,gemini-flash-lite-latest,gemini-flash-latest`. |
