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
    DROP INDEX IF EXISTS appointments_request_id_idx;
  `);

  await pool.query(`
    WITH duplicate_appointments AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY request_id
          ORDER BY start_at DESC, id DESC
        ) AS rank
      FROM appointments
      WHERE status = 'scheduled'
    )
    UPDATE appointments
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, NOW())
    WHERE id IN (
      SELECT id
      FROM duplicate_appointments
      WHERE rank > 1
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_scheduled_request_id_idx
      ON appointments(request_id)
      WHERE status = 'scheduled';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM time_windows
        GROUP BY start_at, end_at
        HAVING COUNT(*) > 1
      ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS time_windows_range_unique_idx
          ON time_windows(start_at, end_at);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'time_windows_no_overlap'
      ) AND NOT EXISTS (
        SELECT 1
        FROM time_windows left_window
        JOIN time_windows right_window
          ON left_window.id < right_window.id
          AND left_window.start_at < right_window.end_at
          AND right_window.start_at < left_window.end_at
      ) THEN
        ALTER TABLE time_windows
          ADD CONSTRAINT time_windows_no_overlap
          EXCLUDE USING gist (tstzrange(start_at, end_at, '[)') WITH &&);
      END IF;
    END $$;
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
