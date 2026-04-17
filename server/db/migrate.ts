import { pool } from "./pool.js";
import { generatePublicToken } from "../lib/publicTokens.js";

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

  await pool.query(`
    ALTER TABLE IF EXISTS booking_requests
      ADD COLUMN IF NOT EXISTS public_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS appointments
      ADD COLUMN IF NOT EXISTS public_token TEXT;
  `);

  const requestsWithoutToken = await pool.query<{
    id: string;
  }>(`
    SELECT id
    FROM booking_requests
    WHERE public_token IS NULL OR public_token = ''
  `);

  for (const row of requestsWithoutToken.rows) {
    await pool.query(
      `
        UPDATE booking_requests
        SET public_token = $2
        WHERE id = $1
      `,
      [row.id, generatePublicToken()],
    );
  }

  const appointmentsWithoutToken = await pool.query<{
    id: string;
  }>(`
    SELECT id
    FROM appointments
    WHERE public_token IS NULL OR public_token = ''
  `);

  for (const row of appointmentsWithoutToken.rows) {
    await pool.query(
      `
        UPDATE appointments
        SET public_token = $2
        WHERE id = $1
      `,
      [row.id, generatePublicToken()],
    );
  }

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_public_token_idx
      ON booking_requests(public_token);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_public_token_idx
      ON appointments(public_token);
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS booking_requests
      ALTER COLUMN public_token SET NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS appointments
      ALTER COLUMN public_token SET NOT NULL;
  `);
}
