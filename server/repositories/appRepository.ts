import type { PoolClient } from "pg";
import type {
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../src/types.js";
import { seedClients, seedPhotos, seedRequests, servicePresets, timeWindows } from "../../src/data.js";
import { pool } from "../db/pool.js";
import {
  toAppointment,
  toBookingRequest,
  toClient,
  toPhoto,
  toService,
  toTimeWindow,
} from "../db/mappers.js";

export type AppSnapshot = {
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  appointments: Appointment[];
  windows: TimeWindow[];
  services: ServicePreset[];
};

export type PublicBookingConfig = {
  services: ServicePreset[];
  windows: TimeWindow[];
};

export async function getPublicBookingConfig(): Promise<PublicBookingConfig> {
  const [services, windows] = await Promise.all([
    pool.query("SELECT * FROM service_presets ORDER BY title ASC"),
    pool.query(
      "SELECT * FROM time_windows WHERE status IN ('available', 'offered') ORDER BY start_at ASC",
    ),
  ]);

  return {
    services: services.rows.map(toService),
    windows: windows.rows.map(toTimeWindow),
  };
}

export async function getSnapshot(): Promise<AppSnapshot> {
  const [clients, photos, requests, appointments, windows, services] = await Promise.all([
    pool.query("SELECT * FROM clients ORDER BY id DESC"),
    pool.query("SELECT * FROM photo_attachments ORDER BY id DESC"),
    pool.query("SELECT * FROM booking_requests ORDER BY created_at DESC"),
    pool.query("SELECT * FROM appointments ORDER BY start_at DESC"),
    pool.query("SELECT * FROM time_windows ORDER BY start_at ASC"),
    pool.query("SELECT * FROM service_presets ORDER BY title ASC"),
  ]);

  return {
    clients: clients.rows.map(toClient),
    photos: photos.rows.map(toPhoto),
    requests: requests.rows.map(toBookingRequest),
    appointments: appointments.rows.map(toAppointment),
    windows: windows.rows.map(toTimeWindow),
    services: services.rows.map(toService),
  };
}

export async function bootstrapSeedData() {
  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM service_presets");

  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    return;
  }

  await withTransaction(async (client) => {
    for (const service of servicePresets) {
      await client.query(
        `INSERT INTO service_presets
          (id, title, duration_minutes, price_from, requires_hand_photo, requires_reference, options)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          service.id,
          service.title,
          service.durationMinutes,
          service.priceFrom ?? null,
          service.requiresHandPhoto,
          service.requiresReference,
          JSON.stringify(service.options),
        ],
      );
    }

    for (const window of timeWindows) {
      await client.query(
        `INSERT INTO time_windows (id, start_at, end_at, status, label)
        VALUES ($1, $2, $3, $4, $5)`,
        [window.id, window.startAt, window.endAt, window.status, window.label],
      );
    }

    for (const seedClient of seedClients) {
      await insertClient(client, seedClient);
    }

    for (const photo of seedPhotos) {
      await insertPhoto(client, photo);
    }

    for (const request of seedRequests) {
      await insertRequest(client, request);
    }
  });
}

export async function createBookingRequest(payload: {
  client: Client;
  photos: PhotoAttachment[];
  request: BookingRequest;
}) {
  await withTransaction(async (client) => {
    await insertClient(client, payload.client);

    for (const photo of payload.photos) {
      await insertPhoto(client, photo);
    }

    await insertRequest(client, payload.request);
  });
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  const result = await pool.query(
    "UPDATE booking_requests SET status = $2 WHERE id = $1 RETURNING *",
    [id, status],
  );

  return result.rows[0] ? toBookingRequest(result.rows[0]) : null;
}

export async function updateRequestWindow(
  id: string,
  preferredWindowId: string | null,
  customWindowText?: string,
) {
  const result = await pool.query(
    `UPDATE booking_requests
    SET preferred_window_id = $2, custom_window_text = $3, status = 'waiting_client'
    WHERE id = $1
    RETURNING *`,
    [id, preferredWindowId, customWindowText ?? null],
  );

  return result.rows[0] ? toBookingRequest(result.rows[0]) : null;
}

export async function updateClientNotes(id: string, notes: string) {
  const result = await pool.query("UPDATE clients SET notes = $2 WHERE id = $1 RETURNING *", [
    id,
    notes,
  ]);

  return result.rows[0] ? toClient(result.rows[0]) : null;
}

export async function updateService(id: string, patch: Partial<ServicePreset>) {
  const result = await pool.query(
    `UPDATE service_presets
    SET
      duration_minutes = COALESCE($2, duration_minutes),
      price_from = COALESCE($3, price_from),
      requires_hand_photo = COALESCE($4, requires_hand_photo),
      requires_reference = COALESCE($5, requires_reference)
    WHERE id = $1
    RETURNING *`,
    [
      id,
      patch.durationMinutes ?? null,
      patch.priceFrom ?? null,
      patch.requiresHandPhoto ?? null,
      patch.requiresReference ?? null,
    ],
  );

  return result.rows[0] ? toService(result.rows[0]) : null;
}

export async function createTimeWindow(window: TimeWindow) {
  const result = await pool.query(
    `INSERT INTO time_windows (id, start_at, end_at, status, label)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [window.id, window.startAt, window.endAt, window.status, window.label],
  );

  return toTimeWindow(result.rows[0]);
}

export async function updateTimeWindowStatus(id: string, status: TimeWindowStatus) {
  const result = await pool.query(
    "UPDATE time_windows SET status = $2 WHERE id = $1 RETURNING *",
    [id, status],
  );

  return result.rows[0] ? toTimeWindow(result.rows[0]) : null;
}

export async function confirmBookingRequest(requestId: string) {
  return withTransaction(async (client) => {
    const requestResult = await client.query(
      "SELECT * FROM booking_requests WHERE id = $1 FOR UPDATE",
      [requestId],
    );
    const request = requestResult.rows[0] ? toBookingRequest(requestResult.rows[0]) : null;

    if (!request?.preferredWindowId) {
      return null;
    }

    const windowResult = await client.query(
      "SELECT * FROM time_windows WHERE id = $1 FOR UPDATE",
      [request.preferredWindowId],
    );
    const window = windowResult.rows[0] ? toTimeWindow(windowResult.rows[0]) : null;

    if (!window || window.status === "reserved" || window.status === "blocked") {
      return null;
    }

    const appointment: Appointment = {
      id: `APT-${Date.now()}`,
      requestId: request.id,
      clientId: request.clientId,
      service: request.service,
      optionIds: request.optionIds,
      startAt: window.startAt,
      endAt: window.endAt,
      durationMinutes: request.estimatedMinutes,
      status: "scheduled",
    };

    await client.query("UPDATE time_windows SET status = 'reserved' WHERE id = $1", [window.id]);
    await client.query("UPDATE booking_requests SET status = 'confirmed' WHERE id = $1", [request.id]);
    await client.query(
      `INSERT INTO appointments
        (id, request_id, client_id, service, option_ids, start_at, end_at, duration_minutes, status, master_note)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        appointment.id,
        appointment.requestId,
        appointment.clientId,
        appointment.service,
        JSON.stringify(appointment.optionIds),
        appointment.startAt,
        appointment.endAt,
        appointment.durationMinutes,
        appointment.status,
        appointment.masterNote ?? null,
      ],
    );

    return appointment;
  });
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertClient(client: PoolClient, item: Client) {
  await client.query(
    `INSERT INTO clients
      (id, name, phone, preferred_contact_channel, contact_handle, first_visit, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      preferred_contact_channel = EXCLUDED.preferred_contact_channel,
      contact_handle = EXCLUDED.contact_handle,
      first_visit = EXCLUDED.first_visit,
      notes = EXCLUDED.notes`,
    [
      item.id,
      item.name,
      item.phone,
      item.preferredContactChannel,
      item.contactHandle,
      item.firstVisit,
      item.notes ?? null,
    ],
  );
}

async function insertPhoto(client: PoolClient, item: PhotoAttachment) {
  await client.query(
    `INSERT INTO photo_attachments (id, kind, file_name, preview_url)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind,
      file_name = EXCLUDED.file_name,
      preview_url = EXCLUDED.preview_url`,
    [item.id, item.kind, item.fileName, item.previewUrl ?? null],
  );
}

async function insertRequest(client: PoolClient, item: BookingRequest) {
  await client.query(
    `INSERT INTO booking_requests
      (
        id, client_id, service, option_ids, length, desired_result, photo_ids,
        preferred_window_id, custom_window_text, comment, estimated_minutes,
        estimated_price_from, status, created_at, master_note, clarification_question
      )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (id) DO NOTHING`,
    [
      item.id,
      item.clientId,
      item.service,
      JSON.stringify(item.optionIds),
      item.length,
      item.desiredResult,
      JSON.stringify(item.photoIds),
      item.preferredWindowId,
      item.customWindowText ?? null,
      item.comment,
      item.estimatedMinutes,
      item.estimatedPriceFrom ?? null,
      item.status,
      item.createdAt,
      item.masterNote ?? null,
      item.clarificationQuestion ?? null,
    ],
  );
}
