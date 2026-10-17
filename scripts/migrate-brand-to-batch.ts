import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function migrate() {
  console.log("Adding brand_name and manufacturer columns to batches...");

  // Add columns if they don't exist (idempotent)
  await db.execute(sql`
    ALTER TABLE batches
    ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS manufacturer text NOT NULL DEFAULT ''
  `);

  console.log("Columns added. Backfilling from medicines table...");

  // Backfill: copy brand_name and manufacturer from the medicine into each of its batches
  await db.execute(sql`
    UPDATE batches b
    SET
      brand_name = m.brand_name,
      manufacturer = m.manufacturer
    FROM medicines m
    WHERE b.medicine_id = m.id
      AND (b.brand_name = '' OR b.manufacturer = '')
  `);

  console.log("Backfill complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
