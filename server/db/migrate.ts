import { pool } from "./pool.js";

export async function runMigrations() {
  await pool.query(`
    ALTER TABLE IF EXISTS clients
      ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS appointments
      ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_3h_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS survey_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS survey_rating INTEGER CHECK (survey_rating BETWEEN 1 AND 5),
      ADD COLUMN IF NOT EXISTS survey_text TEXT,
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
  `);
}
