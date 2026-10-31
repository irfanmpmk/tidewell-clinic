import { Pool } from "pg";
import { seedAppointments, seedCatalog } from "./seed";

// Postgres on Neon when DATABASE_URL is set; PGlite (Postgres in WebAssembly, stored in .pglite/) locally.
// All tables live in the "clinic" schema so this demo can share a database with others.
type Params = unknown[];
export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
}
export interface Db extends Tx {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

const SCHEMA = `
  CREATE SCHEMA IF NOT EXISTS clinic;
  CREATE TABLE IF NOT EXISTS clinic.doctors (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    specialty TEXT NOT NULL,
    bio TEXT NOT NULL,
    languages TEXT[] NOT NULL DEFAULT '{}',
    work_days INTEGER[] NOT NULL,          -- 0 = Sunday ... 6 = Saturday
    start_time TEXT NOT NULL,              -- 'HH:MM' clinic time
    end_time TEXT NOT NULL,
    color TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clinic.services (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    price INTEGER NOT NULL,
    description TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clinic.appointments (
    id SERIAL PRIMARY KEY,
    ref TEXT UNIQUE NOT NULL,
    doctor_id INTEGER NOT NULL REFERENCES clinic.doctors(id),
    service_id INTEGER NOT NULL REFERENCES clinic.services(id),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    patient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT NOT NULL DEFAULT '',
    new_patient BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'booked',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS appointments_doctor_time ON clinic.appointments (doctor_id, starts_at);
`;

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    return {
      query: async (sql, params) => (await pool.query(sql, params)).rows,
      exec: async (sql) => void (await pool.query(sql)),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn({ query: async (sql, params) => (await client.query(sql, params)).rows });
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(process.env.PGLITE_DIR || ".pglite");
  return {
    query: async <T,>(sql: string, params?: Params) => (await pg.query<T>(sql, params)).rows,
    exec: async (sql: string) => void (await pg.exec(sql)),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: async <T,>(sql: string, params?: Params) => (await tx.query<T>(sql, params)).rows })),
  };
}

async function init(): Promise<Db> {
  const db = await connect();
  await db.exec(SCHEMA);
  const [{ n }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clinic.doctors");
  if (n === 0) {
    await seedCatalog(db);
    await seedAppointments(db);
  }
  return db;
}

const g = globalThis as unknown as { __clinicDb?: Promise<Db> };
export function getDb(): Promise<Db> {
  g.__clinicDb ??= init().catch((err) => {
    g.__clinicDb = undefined;
    throw err;
  });
  return g.__clinicDb;
}
