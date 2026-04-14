import type { PoolClient } from "pg";
import type {
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../src/types.js";
import { seedClients, seedPhotos, seedRequests, serviceOptions, servicePresets, timeWindows } from "../../src/data.js";
import { pool } from "../db/pool.js";
import {
  toAppointment,
  toBookingRequest,
  toClient,
  toPhoto,
  toService,
  toServiceOption,
  toTimeWindow,
} from "../db/mappers.js";

export type AppSnapshot = {
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  appointments: Appointment[];
  windows: TimeWindow[];
  services: ServicePreset[];
  serviceOptions: ServiceOption[];
};

export type PublicBookingConfig = {
  services: ServicePreset[];
  windows: TimeWindow[];
  serviceOptions: ServiceOption[];
};

export async function getPublicBookingConfig(): Promise<PublicBookingConfig> {
  const [services, windows, options] = await Promise.all([
    pool.query("SELECT * FROM service_presets ORDER BY title ASC"),
    pool.query(
      "SELECT * FROM time_windows WHERE status = 'available' ORDER BY start_at ASC",
    ),
    pool.query("SELECT * FROM service_options ORDER BY title ASC"),
  ]);

  return {
    services: services.rows.map(toService),
    windows: windows.rows.map(toTimeWindow),
    serviceOptions: options.rows.map(toServiceOption),
  };
}

export async function getSnapshot(): Promise<AppSnapshot> {
  const [clients, photos, requests, appointments, windows, services, options] = await Promise.all([
    pool.query("SELECT * FROM clients ORDER BY id DESC"),
    pool.query("SELECT * FROM photo_attachments ORDER BY id DESC"),
    pool.query("SELECT * FROM booking_requests ORDER BY created_at DESC"),
    pool.query("SELECT * FROM appointments ORDER BY start_at DESC"),
    pool.query("SELECT * FROM time_windows ORDER BY start_at ASC"),
    pool.query("SELECT * FROM service_presets ORDER BY title ASC"),
    pool.query("SELECT * FROM service_options ORDER BY title ASC"),
  ]);

  return {
    clients: clients.rows.map(toClient),
    photos: photos.rows.map(toPhoto),
    requests: requests.rows.map(toBookingRequest),
    appointments: appointments.rows.map(toAppointment),
    windows: windows.rows.map(toTimeWindow),
    services: services.rows.map(toService),
    serviceOptions: options.rows.map(toServiceOption),
  };
}

export async function getBookingRequest(id: string) {
  const result = await pool.query("SELECT * FROM booking_requests WHERE id = $1", [id]);
  return result.rows[0] ? toBookingRequest(result.rows[0]) : null;
}

export async function getAppointment(id: string) {
  const result = await pool.query("SELECT * FROM appointments WHERE id = $1", [id]);
  return result.rows[0] ? toAppointment(result.rows[0]) : null;
}

export async function getTimeWindow(id: string) {
  const result = await pool.query("SELECT * FROM time_windows WHERE id = $1", [id]);
  return result.rows[0] ? toTimeWindow(result.rows[0]) : null;
}

export async function getClient(id: string) {
  const result = await pool.query("SELECT * FROM clients WHERE id = $1", [id]);
  return result.rows[0] ? toClient(result.rows[0]) : null;
}

export async function bootstrapSeedData() {
  const [existingServices, existingOptions] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM service_presets"),
    pool.query("SELECT COUNT(*)::int AS count FROM service_options"),
  ]);

  const hasServices = Number(existingServices.rows[0]?.count ?? 0) > 0;
  const hasOptions = Number(existingOptions.rows[0]?.count ?? 0) > 0;

  if (hasServices && hasOptions) {
    return;
  }

  await withTransaction(async (client) => {
    if (!hasOptions) {
      for (const option of serviceOptions) {
        await client.query(
          `INSERT INTO service_options
            (id, title, duration_minutes, price_from)
          VALUES ($1, $2, $3, $4)`,
          [option.id, option.title, option.durationMinutes, option.priceFrom ?? null],
        );
      }
    }

    if (!hasServices) {
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
    }

    if (!hasServices) {
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
    if (payload.request.preferredWindowId) {
      await client.query(
        "UPDATE time_windows SET status = 'offered' WHERE id = $1 AND status = 'available'",
        [payload.request.preferredWindowId],
      );
    }
  });
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  return withTransaction(async (client) => {
    const current = await client.query("SELECT * FROM booking_requests WHERE id = $1 FOR UPDATE", [id]);
    const request = current.rows[0] ? toBookingRequest(current.rows[0]) : null;

    if (!request) {
      return null;
    }

    const result = await client.query(
      `UPDATE booking_requests
        SET status = $2,
            preferred_window_id = CASE WHEN $2 = 'declined' THEN NULL ELSE preferred_window_id END
        WHERE id = $1
        RETURNING *`,
      [id, status],
    );

    if (status === "declined" && request.preferredWindowId) {
      await releaseWindowIfUnused(client, request.preferredWindowId);
    }

    return result.rows[0] ? toBookingRequest(result.rows[0]) : null;
  });
}

export async function updateRequestWindow(
  id: string,
  preferredWindowId: string | null,
  customWindowText?: string,
) {
  return withTransaction(async (client) => {
    const current = await client.query("SELECT * FROM booking_requests WHERE id = $1 FOR UPDATE", [id]);
    const request = current.rows[0] ? toBookingRequest(current.rows[0]) : null;

    if (!request) {
      return null;
    }

    const result = await client.query(
      `UPDATE booking_requests
        SET preferred_window_id = $2, custom_window_text = $3, status = 'waiting_client'
        WHERE id = $1
        RETURNING *`,
      [id, preferredWindowId, customWindowText ?? null],
    );

    if (preferredWindowId) {
      await client.query(
        "UPDATE time_windows SET status = 'offered' WHERE id = $1 AND status = 'available'",
        [preferredWindowId],
      );
    }

    if (request.preferredWindowId && request.preferredWindowId !== preferredWindowId) {
      await releaseWindowIfUnused(client, request.preferredWindowId);
    }

    return result.rows[0] ? toBookingRequest(result.rows[0]) : null;
  });
}

export async function updateClientNotes(id: string, notes: string) {
  const result = await pool.query("UPDATE clients SET notes = $2 WHERE id = $1 RETURNING *", [
    id,
    notes,
  ]);

  return result.rows[0] ? toClient(result.rows[0]) : null;
}

export async function deleteClient(id: string) {
  return withTransaction(async (client) => {
    const requestsResult = await client.query(
      "SELECT preferred_window_id, photo_ids FROM booking_requests WHERE client_id = $1 FOR UPDATE",
      [id],
    );
    const requestRows = requestsResult.rows as { preferred_window_id: string | null; photo_ids: string[] }[];
    const affectedWindowIds = [
      ...new Set(requestRows.map((row) => row.preferred_window_id).filter((value): value is string => Boolean(value))),
    ];
    const photoIds = [
      ...new Set(
        requestRows.flatMap((row) =>
          Array.isArray(row.photo_ids) ? row.photo_ids.map((photoId) => String(photoId)) : [],
        ),
      ),
    ];

    if (photoIds.length > 0) {
      await client.query("DELETE FROM photo_attachments WHERE id = ANY($1::text[])", [photoIds]);
    }

    const result = await client.query("DELETE FROM clients WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      return false;
    }

    for (const windowId of affectedWindowIds) {
      await releaseWindowIfUnused(client, windowId);
    }

    return true;
  });
}

export async function createService(service: ServicePreset) {
  const result = await pool.query(
    `INSERT INTO service_presets
      (id, title, duration_minutes, price_from, requires_hand_photo, requires_reference, options)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
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

  return toService(result.rows[0]);
}

export async function createServiceOption(option: ServiceOption) {
  const result = await pool.query(
    `INSERT INTO service_options
      (id, title, duration_minutes, price_from)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [option.id, option.title, option.durationMinutes, option.priceFrom ?? null],
  );

  return toServiceOption(result.rows[0]);
}

export async function updateServiceOption(id: string, patch: Partial<ServiceOption>) {
  const result = await pool.query(
    `UPDATE service_options
    SET
      title = COALESCE($2, title),
      duration_minutes = COALESCE($3, duration_minutes),
      price_from = COALESCE($4, price_from)
    WHERE id = $1
    RETURNING *`,
    [id, patch.title ?? null, patch.durationMinutes ?? null, patch.priceFrom ?? null],
  );

  return result.rows[0] ? toServiceOption(result.rows[0]) : null;
}

export async function deleteServiceOption(id: string) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE service_presets
       SET options = (
         SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
         FROM jsonb_array_elements(options) AS value
         WHERE value <> to_jsonb($1::text)
       )`,
      [id],
    );

    const result = await client.query("DELETE FROM service_options WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  });
}

export async function updateService(id: string, patch: Partial<ServicePreset>) {
  const result = await pool.query(
    `UPDATE service_presets
    SET
      title = COALESCE($2, title),
      duration_minutes = COALESCE($3, duration_minutes),
      price_from = COALESCE($4, price_from),
      requires_hand_photo = COALESCE($5, requires_hand_photo),
      requires_reference = COALESCE($6, requires_reference),
      options = COALESCE($7, options)
    WHERE id = $1
    RETURNING *`,
    [
      id,
      patch.title ?? null,
      patch.durationMinutes ?? null,
      patch.priceFrom ?? null,
      patch.requiresHandPhoto ?? null,
      patch.requiresReference ?? null,
      patch.options ? JSON.stringify(patch.options) : null,
    ],
  );

  return result.rows[0] ? toService(result.rows[0]) : null;
}

export async function deleteService(id: string) {
  const result = await pool.query("DELETE FROM service_presets WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
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

export async function moveAppointment(appointmentId: string, windowId: string) {
  return withTransaction(async (client) => {
    const appointmentResult = await client.query(
      "SELECT * FROM appointments WHERE id = $1 FOR UPDATE",
      [appointmentId],
    );
    const appointment = appointmentResult.rows[0] ? toAppointment(appointmentResult.rows[0]) : null;

    if (!appointment) {
      return null;
    }

    const targetResult = await client.query(
      "SELECT * FROM time_windows WHERE id = $1 FOR UPDATE",
      [windowId],
    );
    const targetWindow = targetResult.rows[0] ? toTimeWindow(targetResult.rows[0]) : null;

    if (!targetWindow || targetWindow.status !== "available") {
      return null;
    }

    const oldResult = await client.query(
      `SELECT * FROM time_windows
        WHERE start_at = $1 AND end_at = $2 AND status = 'reserved'
        FOR UPDATE`,
      [appointment.startAt, appointment.endAt],
    );
    const oldWindow = oldResult.rows[0] ? toTimeWindow(oldResult.rows[0]) : null;

    if (!oldWindow) {
      return null;
    }

    await client.query("UPDATE time_windows SET status = 'available' WHERE id = $1", [oldWindow.id]);
    await client.query("UPDATE time_windows SET status = 'reserved' WHERE id = $1", [targetWindow.id]);

    const updated = await client.query(
      `UPDATE appointments
        SET start_at = $2, end_at = $3
        WHERE id = $1
        RETURNING *`,
      [appointment.id, targetWindow.startAt, targetWindow.endAt],
    );

    return updated.rows[0] ? toAppointment(updated.rows[0]) : null;
  });
}

export async function updateAppointmentStatus(id: string, status: Appointment["status"]) {
  return withTransaction(async (client) => {
    const current = await client.query("SELECT * FROM appointments WHERE id = $1 FOR UPDATE", [id]);
    const appointment = current.rows[0] ? toAppointment(current.rows[0]) : null;

    if (!appointment) {
      return null;
    }

    const cancelledAt = status === "cancelled" ? new Date().toISOString() : null;
    const updated = await client.query(
      `UPDATE appointments
        SET status = $2,
            cancelled_at = COALESCE($3, cancelled_at)
        WHERE id = $1
        RETURNING *`,
      [id, status, cancelledAt],
    );

    if (status === "cancelled") {
      await client.query(
        `UPDATE time_windows
          SET status = 'available'
        WHERE start_at = $1 AND end_at = $2 AND status = 'reserved'`,
        [appointment.startAt, appointment.endAt],
      );
    }

    return updated.rows[0] ? toAppointment(updated.rows[0]) : null;
  });
}

export async function markAppointmentReminder(id: string, kind: "24h" | "3h", sentAt: string) {
  const column = kind === "24h" ? "reminder_24h_sent_at" : "reminder_3h_sent_at";
  const result = await pool.query(
    `UPDATE appointments
      SET ${column} = $2
    WHERE id = $1
    RETURNING *`,
    [id, sentAt],
  );

  return result.rows[0] ? toAppointment(result.rows[0]) : null;
}

export async function markAppointmentSurveySent(id: string, sentAt: string) {
  const result = await pool.query(
    `UPDATE appointments
      SET survey_sent_at = $2
    WHERE id = $1
    RETURNING *`,
    [id, sentAt],
  );

  return result.rows[0] ? toAppointment(result.rows[0]) : null;
}

export async function submitAppointmentSurvey(
  id: string,
  payload: { rating: number; text?: string },
) {
  const result = await pool.query(
    `UPDATE appointments
      SET survey_rating = $2,
          survey_text = $3
    WHERE id = $1
    RETURNING *`,
    [id, payload.rating, payload.text ?? null],
  );

  return result.rows[0] ? toAppointment(result.rows[0]) : null;
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

export async function confirmBookingRequestByClient(requestId: string) {
  return withTransaction(async (client) => {
    const requestResult = await client.query(
      "SELECT * FROM booking_requests WHERE id = $1 FOR UPDATE",
      [requestId],
    );
    const request = requestResult.rows[0] ? toBookingRequest(requestResult.rows[0]) : null;

    if (!request || request.status !== "waiting_client" || !request.preferredWindowId) {
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
      (id, name, phone, preferred_contact_channel, contact_handle, first_visit, telegram_user_id, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      preferred_contact_channel = EXCLUDED.preferred_contact_channel,
      contact_handle = EXCLUDED.contact_handle,
      first_visit = EXCLUDED.first_visit,
      telegram_user_id = EXCLUDED.telegram_user_id,
      notes = EXCLUDED.notes`,
    [
      item.id,
      item.name,
      item.phone,
      item.preferredContactChannel,
      item.contactHandle,
      item.firstVisit,
      item.telegramUserId ?? null,
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

async function releaseWindowIfUnused(client: PoolClient, windowId: string) {
  await client.query(
    `UPDATE time_windows
      SET status = 'available'
    WHERE id = $1
      AND status = 'offered'
      AND NOT EXISTS (
        SELECT 1 FROM booking_requests
        WHERE preferred_window_id = $1 AND status != 'declined'
      )`,
    [windowId],
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
