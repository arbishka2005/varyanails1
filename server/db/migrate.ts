import { pool } from "./pool.js";
import { generatePublicToken } from "../lib/publicTokens.js";

export async function runMigrations() {
  await pool.query(`
    ALTER TABLE IF EXISTS clients
      ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS clients
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS booking_requests
      DROP CONSTRAINT IF EXISTS booking_requests_client_id_fkey,
      ADD CONSTRAINT booking_requests_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS appointments
      DROP CONSTRAINT IF EXISTS appointments_client_id_fkey,
      ADD CONSTRAINT appointments_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS appointments
      DROP CONSTRAINT IF EXISTS appointments_request_id_fkey,
      ADD CONSTRAINT appointments_request_id_fkey
        FOREIGN KEY (request_id) REFERENCES booking_requests(id) ON DELETE RESTRICT;
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
    UPDATE appointments
    SET cancelled_at = COALESCE(cancelled_at, NOW())
    WHERE status = 'cancelled';
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
    WITH scheduled_request_windows AS (
      SELECT
        appointment.request_id,
        time_window.id AS window_id,
        ROW_NUMBER() OVER (
          PARTITION BY appointment.request_id
          ORDER BY appointment.start_at DESC, appointment.id DESC
        ) AS rank
      FROM appointments appointment
      JOIN time_windows time_window
        ON time_window.start_at = appointment.start_at
        AND time_window.end_at = appointment.end_at
      WHERE appointment.status = 'scheduled'
    )
    UPDATE booking_requests booking_request
    SET preferred_window_id = scheduled_request_windows.window_id
    FROM scheduled_request_windows
    WHERE booking_request.id = scheduled_request_windows.request_id
      AND booking_request.status = 'confirmed'
      AND booking_request.preferred_window_id IS NULL
      AND scheduled_request_windows.rank = 1;
  `);

  await pool.query(`
    UPDATE booking_requests
    SET status = 'needs_clarification',
        preferred_window_id = NULL,
        custom_window_text = NULL,
        clarification_question = COALESCE(
          clarification_question,
          'Заявка была в активном статусе без конкретного окошка. Нужно выбрать время заново.'
        )
    WHERE status IN ('new', 'waiting_client', 'confirmed')
      AND preferred_window_id IS NULL;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS booking_requests
      DROP CONSTRAINT IF EXISTS booking_requests_active_status_window_required,
      ADD CONSTRAINT booking_requests_active_status_window_required
        CHECK (status NOT IN ('new', 'waiting_client', 'confirmed') OR preferred_window_id IS NOT NULL);
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS appointments
      DROP CONSTRAINT IF EXISTS appointments_cancelled_at_required,
      ADD CONSTRAINT appointments_cancelled_at_required
        CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL);
  `);

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
    WITH duplicate_window_requests AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY preferred_window_id
          ORDER BY
            CASE status
              WHEN 'confirmed' THEN 0
              WHEN 'new' THEN 1
              WHEN 'waiting_client' THEN 2
              ELSE 3
            END,
            created_at DESC,
            id DESC
        ) AS rank
      FROM booking_requests
      WHERE preferred_window_id IS NOT NULL
        AND status IN ('new', 'waiting_client', 'confirmed')
    )
    UPDATE booking_requests
    SET status = 'needs_clarification',
        preferred_window_id = NULL,
        custom_window_text = NULL,
        clarification_question = COALESCE(
          clarification_question,
          'Окошко уже занято другой заявкой. Нужно выбрать новое время.'
        )
    WHERE id IN (
      SELECT id
      FROM duplicate_window_requests
      WHERE rank > 1
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_active_window_idx
      ON booking_requests(preferred_window_id)
      WHERE preferred_window_id IS NOT NULL
        AND status IN ('new', 'waiting_client', 'confirmed');
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
    WITH overlapping_appointments AS (
      SELECT later.id
      FROM appointments later
      WHERE later.status = 'scheduled'
        AND EXISTS (
          SELECT 1
          FROM appointments earlier
          WHERE earlier.status = 'scheduled'
            AND earlier.id <> later.id
            AND earlier.start_at < later.end_at
            AND later.start_at < earlier.end_at
            AND (
              earlier.start_at < later.start_at
              OR (earlier.start_at = later.start_at AND earlier.id < later.id)
            )
        )
    )
    UPDATE appointments
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, NOW())
    WHERE id IN (
      SELECT id
      FROM overlapping_appointments
    );
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
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'appointments_scheduled_no_overlap'
      ) AND NOT EXISTS (
        SELECT 1
        FROM appointments left_appointment
        JOIN appointments right_appointment
          ON left_appointment.id < right_appointment.id
          AND left_appointment.status = 'scheduled'
          AND right_appointment.status = 'scheduled'
          AND left_appointment.start_at < right_appointment.end_at
          AND right_appointment.start_at < left_appointment.end_at
      ) THEN
        ALTER TABLE appointments
          ADD CONSTRAINT appointments_scheduled_no_overlap
          EXCLUDE USING gist (tstzrange(start_at, end_at, '[)') WITH &&)
          WHERE (status = 'scheduled');
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
