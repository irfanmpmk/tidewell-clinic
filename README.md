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

## How double bookings are prevented

Each booking runs in one database transaction that locks the candidate doctors' rows (`SELECT … FOR UPDATE`), re-reads their appointments for that day, re-checks the requested time against the same rules used to show availability, and only then inserts. If two people submit the same slot at once, the second sees "that time was just booked" and picks another.

The availability rules live in `lib/schedule.ts` with no database or framework code, and are unit tested:

```bash
npm test      # Node's built-in test runner
```

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · TypeScript · Tailwind CSS 4 · PostgreSQL (Neon in production, PGlite locally) · Zod

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
