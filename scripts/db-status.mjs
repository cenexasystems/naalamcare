// Read-only: lists the tables in the database from .env.local.
// Usage: node scripts/db-status.mjs
import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";

config({ path: ".env.local" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
);
const version = await pool.query("SELECT version()");
console.log(version.rows[0].version.split(",")[0]);
console.log(rows.length ? rows.map((r) => r.table_name).join(", ") : "(no tables — empty database)");
await pool.end();
