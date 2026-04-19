CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_contact_channel TEXT NOT NULL CHECK (preferred_contact_channel IN ('telegram', 'vk', 'phone')),
  contact_handle TEXT NOT NULL,
  first_visit BOOLEAN NOT NULL DEFAULT TRUE,
  telegram_user_id TEXT,
  notes TEXT,
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS photo_attachments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('hands', 'reference')),
  file_name TEXT NOT NULL,
  preview_url TEXT
);

CREATE TABLE IF NOT EXISTS service_presets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
  price_from INTEGER CHECK (price_from >= 0),
  requires_hand_photo BOOLEAN NOT NULL DEFAULT FALSE,
  requires_reference BOOLEAN NOT NULL DEFAULT FALSE,
  allows_length_selection BOOLEAN NOT NULL DEFAULT TRUE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS service_options (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
  price_from INTEGER CHECK (price_from >= 0)
);

CREATE TABLE IF NOT EXISTS time_windows (
  id TEXT PRIMARY KEY,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'offered', 'reserved', 'blocked')),
  label TEXT NOT NULL,
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS booking_requests (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  service TEXT NOT NULL,
  option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  length TEXT NOT NULL CHECK (length IN ('short', 'medium', 'long', 'extra')),
  desired_result TEXT NOT NULL,
  photo_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_window_id TEXT REFERENCES time_windows(id) ON DELETE SET NULL,
  custom_window_text TEXT,
  comment TEXT NOT NULL DEFAULT '',
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 0),
  estimated_price_from INTEGER CHECK (estimated_price_from >= 0),
  status TEXT NOT NULL CHECK (status IN ('new', 'needs_clarification', 'waiting_client', 'confirmed', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  master_note TEXT,
  clarification_question TEXT,
  CHECK (status NOT IN ('new', 'waiting_client', 'confirmed') OR preferred_window_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE RESTRICT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  service TEXT NOT NULL,
  option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  master_note TEXT,
  reminder_24h_sent_at TIMESTAMPTZ,
  reminder_3h_sent_at TIMESTAMPTZ,
  survey_sent_at TIMESTAMPTZ,
  survey_rating INTEGER CHECK (survey_rating BETWEEN 1 AND 5),
  survey_text TEXT,
  cancelled_at TIMESTAMPTZ,
  CHECK (end_at > start_at),
  CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS booking_requests_client_id_idx ON booking_requests(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_public_token_idx ON booking_requests(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_active_window_idx ON booking_requests(preferred_window_id)
  WHERE preferred_window_id IS NOT NULL AND status IN ('new', 'waiting_client', 'confirmed');
CREATE INDEX IF NOT EXISTS appointments_client_id_idx ON appointments(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_scheduled_request_id_idx ON appointments(request_id)
  WHERE status = 'scheduled';
CREATE UNIQUE INDEX IF NOT EXISTS appointments_public_token_idx ON appointments(public_token);
CREATE INDEX IF NOT EXISTS time_windows_status_idx ON time_windows(status);
CREATE UNIQUE INDEX IF NOT EXISTS time_windows_range_unique_idx ON time_windows(start_at, end_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_windows_no_overlap'
  ) THEN
    ALTER TABLE time_windows
      ADD CONSTRAINT time_windows_no_overlap
      EXCLUDE USING gist (tstzrange(start_at, end_at, '[)') WITH &&);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_scheduled_no_overlap'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_scheduled_no_overlap
      EXCLUDE USING gist (tstzrange(start_at, end_at, '[)') WITH &&)
      WHERE (status = 'scheduled');
  END IF;
END $$;
