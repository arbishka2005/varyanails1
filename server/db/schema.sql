CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_contact_channel TEXT NOT NULL CHECK (preferred_contact_channel IN ('telegram', 'vk', 'phone')),
  contact_handle TEXT NOT NULL,
  first_visit BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT
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
  options JSONB NOT NULL DEFAULT '[]'::jsonb
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
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
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
  clarification_question TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  master_note TEXT,
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS booking_requests_client_id_idx ON booking_requests(client_id);
CREATE INDEX IF NOT EXISTS appointments_client_id_idx ON appointments(client_id);
CREATE INDEX IF NOT EXISTS time_windows_status_idx ON time_windows(status);
