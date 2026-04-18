import type { PoolClient } from "pg";
import type {
  Appointment,
  AppSnapshot,
  BookingRequest,
  Client,
  PhotoAttachment,
  PublicBookingAccess,
  PublicBookingConfig,
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
import { generatePublicToken } from "../lib/publicTokens.js";
import { DomainError } from "../lib/domainErrors.js";
import { makeWindowLabel } from "../../src/lib/displayTime.js";
import { isFutureDateTime } from "../../src/lib/dateTime.js";
import { assertBookingRequestMatchesService } from "../services/bookingValidation.js";

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
    windows: windows.rows.map(toTimeWindow).filter((window) => isFutureDateTime(window.startAt)),
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

export async function getBookingRequestByPublicToken(token: string) {
  const result = await pool.query("SELECT * FROM booking_requests WHERE public_token = $1", [token]);
  return result.rows[0] ? toBookingRequest(result.rows[0]) : null;
}

export async function getAppointment(id: string) {
  const result = await pool.query("SELECT * FROM appointments WHERE id = $1", [id]);
  return result.rows[0] ? toAppointment(result.rows[0]) : null;
}

export async function getAppointmentByPublicToken(token: string) {
  const result = await pool.query("SELECT * FROM appointments WHERE public_token = $1", [token]);
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
  return withTransaction(async (client): Promise<PublicBookingAccess> => {
    if (payload.request.status !== "new") {
      throw new DomainError("Новая заявка должна начинаться в статусе new.");
    }

    if (!payload.request.preferredWindowId) {
      throw new DomainError("Выберите свободное окошко из списка.");
    }

    const serviceResult = await client.query(
      "SELECT * FROM service_presets WHERE id = $1",
      [payload.request.service],
    );
    assertBookingRequestMatchesService(
      payload.request,
      payload.photos,
      serviceResult.rows[0] ? toService(serviceResult.rows[0]) : null,
    );

    const windowResult = await client.query(
      "SELECT * FROM time_windows WHERE id = $1 FOR UPDATE",
      [payload.request.preferredWindowId],
    );
    const selectedWindow = windowResult.rows[0] ? toTimeWindow(windowResult.rows[0]) : null;

    if (!selectedWindow || selectedWindow.status !== "available" || !isFutureDateTime(selectedWindow.startAt)) {
      throw new DomainError("Это окошко уже занято. Выберите другое.");
    }

    await assertWindowIsNotOwnedByAnotherActiveRequest(client, selectedWindow.id, payload.request.id);

    await insertClient(client, payload.client);

    for (const photo of payload.photos) {
      await insertPhoto(client, photo);
    }

    const createdRequest = await insertRequest(client, payload.request);
    await client.query("UPDATE time_windows SET status = 'offered' WHERE id = $1", [createdRequest.preferredWindowId]);

    return {
      requestId: createdRequest.id,
      publicToken: createdRequest.publicToken as string,
    };
  });
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  return withTransaction(async (client) => {
    const current = await client.query("SELECT * FROM booking_requests WHERE id = $1 FOR UPDATE", [id]);
    const request = current.rows[0] ? toBookingRequest(current.rows[0]) : null;

    if (!request) {
      return null;
    }

    const changed = request.status !== status;
    const transitionError = getRequestStatusTransitionError(request, status);

    if (transitionError) {
      throw new DomainError(transitionError);
    }
    const result = await client.query(
      `UPDATE booking_requests
        SET status = $2,
            preferred_window_id = CASE WHEN $2 IN ('declined', 'needs_clarification') THEN NULL ELSE preferred_window_id END,
            custom_window_text = CASE WHEN $2 IN ('declined', 'needs_clarification') THEN NULL ELSE custom_window_text END
        WHERE id = $1
        RETURNING *`,
      [id, status],
    );

    if ((status === "declined" || status === "needs_clarification") && request.preferredWindowId) {
      await releaseWindowIfUnused(client, request.preferredWindowId);
    }

    return result.rows[0] ? { item: toBookingRequest(result.rows[0]), changed } : null;
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

    if (request.status === "confirmed") {
      throw new DomainError("Заявка уже подтверждена. Переносите запись в расписании.");
    }

    if (request.status === "declined") {
      throw new DomainError("Заявка уже отклонена.");
    }

    if (preferredWindowId) {
      const selectedWindowResult = await client.query(
        "SELECT * FROM time_windows WHERE id = $1 FOR UPDATE",
        [preferredWindowId],
      );
      const selectedWindow = selectedWindowResult.rows[0] ? toTimeWindow(selectedWindowResult.rows[0]) : null;

      if (
        !selectedWindow ||
        !isFutureDateTime(selectedWindow.startAt) ||
        (selectedWindow.status !== "available" && preferredWindowId !== request.preferredWindowId)
      ) {
        throw new DomainError("Это окошко уже занято. Выберите другое.");
      }

      if (
        preferredWindowId === request.preferredWindowId &&
        (selectedWindow.status === "reserved" || selectedWindow.status === "blocked")
      ) {
        throw new DomainError("Это окошко уже недоступно.");
      }

      await assertWindowIsNotOwnedByAnotherActiveRequest(client, preferredWindowId, request.id);
    }

    const result = await client.query(
      `UPDATE booking_requests
        SET preferred_window_id = $2,
            custom_window_text = CASE WHEN $2::text IS NULL THEN $3 ELSE NULL END,
            status = CASE WHEN $2::text IS NULL THEN 'needs_clarification' ELSE 'new' END
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
  const result = await pool.query(
    `
      UPDATE clients
      SET archived_at = COALESCE(archived_at, NOW())
      WHERE id = $1
    `,
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function createService(service: ServicePreset) {
  const result = await pool.query(
    `INSERT INTO service_presets
      (id, title, duration_minutes, price_from, requires_hand_photo, requires_reference, options)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO NOTHING
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

  if (!result.rows[0]) {
    throw new DomainError("Service with this id already exists", 409);
  }

  return toService(result.rows[0]);
}

export async function createServiceOption(option: ServiceOption) {
  const result = await pool.query(
    `INSERT INTO service_options
      (id, title, duration_minutes, price_from)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO NOTHING
    RETURNING *`,
    [option.id, option.title, option.durationMinutes, option.priceFrom ?? null],
  );

  if (!result.rows[0]) {
    throw new DomainError("Service option with this id already exists", 409);
  }

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

export async function updateService(
  id: string,
  patch: Omit<Partial<ServicePreset>, "priceFrom"> & { priceFrom?: number | null },
) {
  const result = await pool.query(
    `UPDATE service_presets
    SET
      title = COALESCE($2, title),
      duration_minutes = COALESCE($3, duration_minutes),
      price_from = CASE WHEN $8::boolean THEN $4 ELSE price_from END,
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
      Object.prototype.hasOwnProperty.call(patch, "priceFrom"),
    ],
  );

  return result.rows[0] ? toService(result.rows[0]) : null;
}

export async function deleteService(id: string) {
  const usage = await pool.query(
    `
      SELECT 1 FROM booking_requests WHERE service = $1
      UNION
      SELECT 1 FROM appointments WHERE service = $1
      LIMIT 1
    `,
    [id],
  );

  if ((usage.rowCount ?? 0) > 0) {
    throw new DomainError("Service is already used in booking history", 409);
  }

  const result = await pool.query("DELETE FROM service_presets WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function createTimeWindow(window: TimeWindow) {
  if (window.status !== "available") {
    throw new DomainError("Новое окошко можно создать только свободным.");
  }

  if (!isFutureDateTime(window.startAt)) {
    throw new DomainError("Окошко должно начинаться в будущем.");
  }

  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('time_windows:create'))");

    const duplicateId = await client.query("SELECT id FROM time_windows WHERE id = $1 LIMIT 1", [window.id]);

    if (duplicateId.rows[0]) {
      throw new DomainError("Time window with this id already exists", 409);
    }

    const duplicate = await client.query(
      "SELECT id FROM time_windows WHERE start_at = $1 AND end_at = $2 LIMIT 1",
      [window.startAt, window.endAt],
    );

    if (duplicate.rows[0]) {
      throw new DomainError("Такое окошко уже есть.");
    }

    const overlap = await client.query(
      `SELECT id FROM time_windows
        WHERE start_at < $2::timestamptz
          AND end_at > $1::timestamptz
        LIMIT 1`,
      [window.startAt, window.endAt],
    );

    if (overlap.rows[0]) {
      throw new DomainError("Окошко пересекается с уже созданным.");
    }

    const result = await client.query(
      `INSERT INTO time_windows (id, start_at, end_at, status, label)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [window.id, window.startAt, window.endAt, "available", makeWindowLabel(window.startAt, window.endAt)],
    );

    return toTimeWindow(result.rows[0]);
  });
}

export async function updateTimeWindowStatus(id: string, status: TimeWindowStatus) {
  return withTransaction(async (client) => {
    const currentResult = await client.query("SELECT * FROM time_windows WHERE id = $1 FOR UPDATE", [id]);
    const currentWindow = currentResult.rows[0] ? toTimeWindow(currentResult.rows[0]) : null;

    if (!currentWindow) {
      return null;
    }

    const transitionError = await getManualWindowStatusError(client, currentWindow, status);

    if (transitionError) {
      throw new DomainError(transitionError);
    }

    const result = await client.query(
      "UPDATE time_windows SET status = $2 WHERE id = $1 RETURNING *",
      [id, status],
    );

    return result.rows[0] ? toTimeWindow(result.rows[0]) : null;
  });
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

    if (appointment.status !== "scheduled") {
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

    const targetResult = await client.query(
      "SELECT * FROM time_windows WHERE id = $1 FOR UPDATE",
      [windowId],
    );
    const targetWindow = targetResult.rows[0] ? toTimeWindow(targetResult.rows[0]) : null;

    if (!targetWindow) {
      return null;
    }

    if (targetWindow.id === oldWindow.id) {
      return { item: appointment, changed: false };
    }

    if (targetWindow.status !== "available") {
      throw new DomainError("Перенести можно только в свободное окошко.");
    }

    await assertNoScheduledAppointmentInRange(client, targetWindow.startAt, targetWindow.endAt, appointment.id);

    await client.query("UPDATE time_windows SET status = 'available' WHERE id = $1", [oldWindow.id]);
    await client.query("UPDATE time_windows SET status = 'reserved' WHERE id = $1", [targetWindow.id]);
    await client.query(
      "UPDATE booking_requests SET preferred_window_id = $2 WHERE id = $1",
      [appointment.requestId, targetWindow.id],
    );

    const updated = await client.query(
      `UPDATE appointments
        SET start_at = $2, end_at = $3
        WHERE id = $1
        RETURNING *`,
      [appointment.id, targetWindow.startAt, targetWindow.endAt],
    );

    return updated.rows[0] ? { item: toAppointment(updated.rows[0]), changed: true } : null;
  });
}

export async function updateAppointmentStatus(id: string, status: Appointment["status"]) {
  return withTransaction(async (client) => {
    const current = await client.query("SELECT * FROM appointments WHERE id = $1 FOR UPDATE", [id]);
    const appointment = current.rows[0] ? toAppointment(current.rows[0]) : null;

    if (!appointment) {
      return null;
    }

    const changed = appointment.status !== status;
    const transitionError = getAppointmentStatusTransitionError(appointment, status);

    if (transitionError) {
      throw new DomainError(transitionError);
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
      await client.query(
        `UPDATE booking_requests
          SET status = 'declined',
              preferred_window_id = NULL
        WHERE id = $1 AND status = 'confirmed'`,
        [appointment.requestId],
      );
    }

    return updated.rows[0] ? { item: toAppointment(updated.rows[0]), changed } : null;
  });
}

export async function deleteAppointment(id: string) {
  return withTransaction(async (client) => {
    const current = await client.query("SELECT * FROM appointments WHERE id = $1 FOR UPDATE", [id]);
    const appointment = current.rows[0] ? toAppointment(current.rows[0]) : null;

    if (!appointment) {
      return null;
    }

    const changed = appointment.status !== "cancelled";
    let cancelledAppointment = appointment;

    if (changed) {
      const cancelledAt = new Date().toISOString();
      await client.query(
        `UPDATE appointments
          SET status = 'cancelled',
              cancelled_at = COALESCE(cancelled_at, $2)
        WHERE id = $1`,
        [id, cancelledAt],
      );
      await client.query(
        `UPDATE time_windows
            SET status = 'available'
          WHERE start_at = $1 AND end_at = $2 AND status = 'reserved'`,
        [appointment.startAt, appointment.endAt],
      );
      await client.query(
        `UPDATE booking_requests
            SET status = 'declined',
                preferred_window_id = NULL
          WHERE id = $1 AND status = 'confirmed'`,
        [appointment.requestId],
      );
      cancelledAppointment = { ...appointment, status: "cancelled", cancelledAt: appointment.cancelledAt ?? cancelledAt };
    }

    return { item: cancelledAppointment, changed };
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
      AND survey_rating IS NULL
    RETURNING *`,
    [id, payload.rating, payload.text ?? null],
  );

  return result.rows[0] ? toAppointment(result.rows[0]) : null;
}

export async function submitAppointmentSurveyByPublicToken(
  token: string,
  payload: { rating: number; text?: string },
) {
  const result = await pool.query(
    `UPDATE appointments
      SET survey_rating = $2,
          survey_text = $3
    WHERE public_token = $1
      AND survey_rating IS NULL
    RETURNING *`,
    [token, payload.rating, payload.text ?? null],
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
    const existingAppointment = await getAppointmentForRequest(client, requestId);

    if (existingAppointment) {
      return { appointment: existingAppointment, created: false };
    }

    if (!request?.preferredWindowId || (request.status !== "new" && request.status !== "waiting_client")) {
      return null;
    }

    const windowResult = await client.query(
      "SELECT * FROM time_windows WHERE id = $1 FOR UPDATE",
      [request.preferredWindowId],
    );
    const window = windowResult.rows[0] ? toTimeWindow(windowResult.rows[0]) : null;

    if (!window || !isFutureDateTime(window.startAt) || window.status === "reserved" || window.status === "blocked") {
      return null;
    }

    await assertWindowIsNotOwnedByAnotherActiveRequest(client, window.id, request.id);
    await assertNoScheduledAppointmentInRange(client, window.startAt, window.endAt);

    const appointment: Appointment = {
      id: `APT-${request.id}`,
      publicToken: generatePublicToken(),
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
        (id, public_token, request_id, client_id, service, option_ids, start_at, end_at, duration_minutes, status, master_note)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        appointment.id,
        appointment.publicToken,
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

    return { appointment, created: true };
  });
}

export async function confirmBookingRequestByClient(requestId: string) {
  return withTransaction(async (client) => {
    const requestResult = await client.query(
      "SELECT * FROM booking_requests WHERE id = $1 FOR UPDATE",
      [requestId],
    );
    const request = requestResult.rows[0] ? toBookingRequest(requestResult.rows[0]) : null;
    const existingAppointment = await getAppointmentForRequest(client, requestId);

    if (existingAppointment) {
      return { appointment: existingAppointment, created: false };
    }

    if (!request || request.status !== "waiting_client" || !request.preferredWindowId) {
      return null;
    }

    const windowResult = await client.query(
      "SELECT * FROM time_windows WHERE id = $1 FOR UPDATE",
      [request.preferredWindowId],
    );
    const window = windowResult.rows[0] ? toTimeWindow(windowResult.rows[0]) : null;

    if (!window || !isFutureDateTime(window.startAt) || window.status === "reserved" || window.status === "blocked") {
      return null;
    }

    await assertWindowIsNotOwnedByAnotherActiveRequest(client, window.id, request.id);
    await assertNoScheduledAppointmentInRange(client, window.startAt, window.endAt);

    const appointment: Appointment = {
      id: `APT-${request.id}`,
      publicToken: generatePublicToken(),
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
        (id, public_token, request_id, client_id, service, option_ids, start_at, end_at, duration_minutes, status, master_note)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        appointment.id,
        appointment.publicToken,
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

    return { appointment, created: true };
  });
}

export async function confirmBookingRequestByPublicToken(token: string) {
  const request = await getBookingRequestByPublicToken(token);

  if (!request) {
    return null;
  }

  return confirmBookingRequestByClient(request.id);
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
      (id, name, phone, preferred_contact_channel, contact_handle, first_visit, telegram_user_id, notes, archived_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      preferred_contact_channel = EXCLUDED.preferred_contact_channel,
      contact_handle = EXCLUDED.contact_handle,
      first_visit = EXCLUDED.first_visit,
      telegram_user_id = EXCLUDED.telegram_user_id,
      notes = EXCLUDED.notes,
      archived_at = EXCLUDED.archived_at`,
    [
      item.id,
      item.name,
      item.phone,
      item.preferredContactChannel,
      item.contactHandle,
      item.firstVisit,
      item.telegramUserId ?? null,
      item.notes ?? null,
      item.archivedAt ?? null,
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
        WHERE preferred_window_id = $1 AND status IN ('new', 'waiting_client', 'confirmed')
      )`,
    [windowId],
  );
}

function getRequestStatusTransitionError(request: BookingRequest, nextStatus: RequestStatus) {
  if (request.status === nextStatus) {
    return "";
  }

  if (nextStatus === "confirmed") {
    return "Подтверждение заявки проходит через создание записи.";
  }

  if (nextStatus === "waiting_client") {
    return "waiting_client оставлен только для старых заявок.";
  }

  if (request.status === "confirmed") {
    return "Подтверждённую заявку меняйте через запись в расписании.";
  }

  if (request.status === "declined") {
    return "Отклонённая заявка закрыта.";
  }

  if (nextStatus !== "needs_clarification" && nextStatus !== "declined") {
    return "Недопустимый переход статуса заявки.";
  }

  return "";
}

async function getAppointmentForRequest(client: PoolClient, requestId: string) {
  const result = await client.query(
    "SELECT * FROM appointments WHERE request_id = $1 AND status = 'scheduled' LIMIT 1",
    [requestId],
  );

  return result.rows[0] ? toAppointment(result.rows[0]) : null;
}

async function assertWindowIsNotOwnedByAnotherActiveRequest(
  client: PoolClient,
  windowId: string,
  requestId: string,
) {
  const result = await client.query(
    `SELECT id FROM booking_requests
      WHERE preferred_window_id = $1
        AND id <> $2
        AND status IN ('new', 'waiting_client', 'confirmed')
      LIMIT 1`,
    [windowId, requestId],
  );

  if (result.rows[0]) {
    throw new DomainError("Это окошко уже привязано к другой заявке.");
  }
}

async function assertNoScheduledAppointmentInRange(
  client: PoolClient,
  startAt: string,
  endAt: string,
  ignoredAppointmentId?: string,
) {
  const result = await client.query(
    `SELECT id FROM appointments
      WHERE status = 'scheduled'
        AND start_at < $2::timestamptz
        AND end_at > $1::timestamptz
        AND ($3::text IS NULL OR id <> $3)
      LIMIT 1`,
    [startAt, endAt, ignoredAppointmentId ?? null],
  );

  if (result.rows[0]) {
    throw new DomainError("This time is already occupied by another appointment.", 409);
  }
}

function getAppointmentStatusTransitionError(
  appointment: Appointment,
  nextStatus: Appointment["status"],
) {
  if (appointment.status === nextStatus) {
    return "";
  }

  if (appointment.status !== "scheduled") {
    return "Closed appointment status cannot be changed.";
  }

  if (nextStatus === "scheduled") {
    return "Cancelled or finished appointment cannot be reopened.";
  }

  return "";
}

async function getManualWindowStatusError(
  client: PoolClient,
  window: TimeWindow,
  nextStatus: TimeWindowStatus,
) {
  if (window.status === nextStatus) {
    return "";
  }

  const isManualTransition =
    (window.status === "available" && nextStatus === "blocked") ||
    (window.status === "blocked" && nextStatus === "available");

  if (!isManualTransition) {
    return "Этот статус меняется только через заявку или запись.";
  }

  const activeRequest = await client.query(
    `SELECT id FROM booking_requests
      WHERE preferred_window_id = $1
        AND status IN ('new', 'waiting_client', 'confirmed')
      LIMIT 1`,
    [window.id],
  );

  if (activeRequest.rows[0]) {
    return "Окошко уже привязано к заявке.";
  }

  const activeAppointment = await client.query(
    `SELECT id FROM appointments
      WHERE start_at = $1
        AND end_at = $2
        AND status = 'scheduled'
      LIMIT 1`,
    [window.startAt, window.endAt],
  );

  if (activeAppointment.rows[0]) {
    return "Окошко уже занято записью.";
  }

  return "";
}

async function insertRequest(client: PoolClient, item: BookingRequest) {
  const request = {
    ...item,
    publicToken: item.publicToken ?? generatePublicToken(),
  };

  const result = await client.query(
    `INSERT INTO booking_requests
      (
        id, public_token, client_id, service, option_ids, length, desired_result, photo_ids,
        preferred_window_id, custom_window_text, comment, estimated_minutes,
        estimated_price_from, status, created_at, master_note, clarification_question
      )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (id) DO NOTHING
    RETURNING *`,
    [
      request.id,
      request.publicToken,
      request.clientId,
      request.service,
      JSON.stringify(request.optionIds),
      request.length,
      request.desiredResult,
      JSON.stringify(request.photoIds),
      request.preferredWindowId,
      request.customWindowText ?? null,
      request.comment,
      request.estimatedMinutes,
      request.estimatedPriceFrom ?? null,
      request.status,
      request.createdAt,
      request.masterNote ?? null,
      request.clarificationQuestion ?? null,
    ],
  );

  if (!result.rows[0]) {
    throw new DomainError("Booking request with this id already exists", 409);
  }

  return toBookingRequest(result.rows[0]);
}
