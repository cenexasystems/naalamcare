// Creates / updates the whole schema in the database from .env.local by running
// database.sql (one complete file; safe on a new database and safe to re-run).
// Usage: node scripts/setup-db.mjs
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(readFileSync("database.sql", "utf8"));
const { rows } = await pool.query(
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
);
console.log(`database.sql applied — ${rows[0].n} tables`);
await pool.end();
