import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getCurrentIsoTimestamp,
  getLocalDateKey,
  toAppDateTime,
} from "../../src/lib/dateTime.js";
import type {
  Appointment,
  AppSnapshot,
  BookingRequest,
  Client,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../src/types.js";
import type { Repository } from "../repositories/types.js";

const repositoryStoragePath = join(tmpdir(), `varyanails-repository-tests-${Date.now()}.json`);
process.env.FILE_STORAGE_PATH = repositoryStoragePath;
process.env.STORAGE_DRIVER = "file";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const { fileRepository } = await import("../repositories/fileRepository.js");

const baseService: ServicePreset = {
  id: "logic-test-service",
  title: "Logic test service",
  durationMinutes: 60,
  priceFrom: 1000,
  requiresHandPhoto: false,
  requiresReference: false,
  allowsLengthSelection: false,
  options: [],
};

const baseClient: Client = {
  id: "logic-client",
  name: "Client",
  phone: "+79990000000",
  preferredContactChannel: "telegram",
  contactHandle: "@client",
  firstVisit: true,
};

const emptySnapshot: AppSnapshot = {
  appointments: [],
  clients: [],
  photos: [],
  requests: [],
  serviceOptions: [],
  services: [],
  windows: [],
};

function makeSnapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    ...emptySnapshot,
    ...patch,
    appointments: patch.appointments ?? [],
    clients: patch.clients ?? [],
    photos: patch.photos ?? [],
    requests: patch.requests ?? [],
    serviceOptions: patch.serviceOptions ?? [],
    services: patch.services ?? [],
    windows: patch.windows ?? [],
  };
}

function makeWindow(
  id: string,
  startAt: string,
  endAt: string,
  status: TimeWindowStatus = "available",
): TimeWindow {
  return {
    id,
    startAt,
    endAt,
    status,
    label: `${startAt}-${endAt}`,
  };
}

function makeRequest(
  id: string,
  preferredWindowId: string | null,
  status: BookingRequest["status"] = "new",
): BookingRequest {
  return {
    id,
    publicToken: `token-${id}`,
    clientId: baseClient.id,
    service: baseService.id,
    optionIds: [],
    length: "short",
    desiredResult: "Test request",
    photoIds: [],
    preferredWindowId,
    comment: "",
    estimatedMinutes: baseService.durationMinutes,
    estimatedPriceFrom: baseService.priceFrom,
    status,
    createdAt: getCurrentIsoTimestamp(),
  };
}

function makeAppointment(
  id: string,
  requestId: string,
  startAt: string,
  endAt: string,
): Appointment {
  return {
    id,
    publicToken: `apt-token-${id}`,
    requestId,
    clientId: baseClient.id,
    service: baseService.id,
    optionIds: [],
    startAt,
    endAt,
    durationMinutes: baseService.durationMinutes,
    status: "scheduled",
  };
}

function futureRange(start = "10:00", end = "11:00") {
  return {
    endAt: toAppDateTime("2035-04-18", end),
    startAt: toAppDateTime("2035-04-18", start),
  };
}

function pastRange(start = "10:00", end = "11:00") {
  return {
    endAt: toAppDateTime("2024-04-18", end),
    startAt: toAppDateTime("2024-04-18", start),
  };
}

function ongoingRange() {
  return {
    endAt: toAppDateTime("2035-04-18", "11:00"),
    startAt: toAppDateTime("2024-04-18", "10:00"),
  };
}

async function resetFileRepository(snapshot = makeSnapshot()) {
  await mkdir(dirname(repositoryStoragePath), { recursive: true });
  await writeFile(repositoryStoragePath, JSON.stringify(snapshot, null, 2), "utf8");
}

async function createServiceAndWindow(repository: Repository, window: TimeWindow) {
  await repository.createService(baseService);
  return repository.createTimeWindow(window);
}

async function createBookingPayload(repository: Repository, request: BookingRequest) {
  return repository.createBookingRequest({
    client: baseClient,
    photos: [],
    request,
  });
}

async function runCriticalRepositoryContract(repository: Repository, reset: (snapshot?: AppSnapshot) => Promise<void>) {
  await reset();
  const firstWindow = makeWindow("win-duplicate", futureRange("10:00", "11:00").startAt, futureRange("10:00", "11:00").endAt);
  await createServiceAndWindow(repository, firstWindow);
  await assert.rejects(
    () => repository.createTimeWindow({ ...firstWindow }),
    /already exists|уже есть/i,
  );
  await assert.rejects(
    () => repository.createTimeWindow(makeWindow("win-same-range", firstWindow.startAt, firstWindow.endAt)),
    /уже есть|duplicate/i,
  );
  await assert.rejects(
    () => repository.createTimeWindow(makeWindow("win-overlap", futureRange("10:30", "11:30").startAt, futureRange("10:30", "11:30").endAt)),
    /пересекается|overlap|conflicting key/i,
  );

  await reset();
  const midnightWindow = makeWindow(
    "win-midnight",
    toAppDateTime("2035-04-18", "01:20"),
    toAppDateTime("2035-04-18", "02:30"),
  );
  await createServiceAndWindow(repository, midnightWindow);
  const midnightSnapshot = await repository.getSnapshot();
  const createdMidnightWindow = midnightSnapshot.windows.find((window) => window.id === midnightWindow.id);
  assert.ok(createdMidnightWindow);
  assert.equal(getLocalDateKey(createdMidnightWindow.startAt), "2035-04-18");

  await reset(
    makeSnapshot({
      services: [baseService],
      windows: [
        makeWindow("past-blocked", pastRange().startAt, pastRange().endAt, "blocked"),
        makeWindow("ongoing-blocked", ongoingRange().startAt, ongoingRange().endAt, "blocked"),
      ],
    }),
  );
  await assert.rejects(
    () => repository.updateTimeWindowStatus("past-blocked", "available"),
    /Прошедшее|future|past/i,
  );
  await assert.rejects(
    () => repository.updateTimeWindowStatus("ongoing-blocked", "available"),
    /Прошедшее|future|past/i,
  );

  await reset();
  await repository.createService(baseService);
  await assert.rejects(
    () => createBookingPayload(repository, makeRequest("req-no-window", null)),
    /окошко|window/i,
  );
  await assert.rejects(
    () => createBookingPayload(repository, makeRequest("req-missing-window", "missing-window")),
    /окошко|window/i,
  );

  await reset();
  const bookingWindow = makeWindow("win-booking", futureRange("12:00", "13:00").startAt, futureRange("12:00", "13:00").endAt);
  await createServiceAndWindow(repository, bookingWindow);
  const bookingRequest = makeRequest("req-booking", bookingWindow.id);
  await createBookingPayload(repository, bookingRequest);
  assert.equal((await repository.getTimeWindow(bookingWindow.id))?.status, "offered");
  const confirmed = await repository.confirmBookingRequest(bookingRequest.id);
  assert.equal(confirmed?.created, true);
  assert.equal((await repository.getTimeWindow(bookingWindow.id))?.status, "reserved");
  assert.equal((await repository.getBookingRequest(bookingRequest.id))?.status, "confirmed");
  assert.equal((await repository.getAppointment(`APT-${bookingRequest.id}`))?.status, "scheduled");

  await reset();
  const oldWindow = makeWindow("win-old-reserved", futureRange("14:00", "15:00").startAt, futureRange("14:00", "15:00").endAt, "reserved");
  const targetWindow = makeWindow("win-target", futureRange("16:00", "17:00").startAt, futureRange("16:00", "17:00").endAt);
  const moveRequest = makeRequest("req-move", oldWindow.id, "confirmed");
  const moveAppointment = makeAppointment("apt-move", moveRequest.id, oldWindow.startAt, oldWindow.endAt);
  await reset(makeSnapshot({
    appointments: [moveAppointment],
    clients: [baseClient],
    requests: [moveRequest],
    services: [baseService],
    windows: [oldWindow, targetWindow],
  }));
  const moved = await repository.moveAppointment(moveAppointment.id, targetWindow.id);
  assert.equal(moved?.changed, true);
  assert.equal((await repository.getTimeWindow(oldWindow.id))?.status, "available");
  assert.equal((await repository.getTimeWindow(targetWindow.id))?.status, "reserved");
  assert.equal((await repository.getAppointment(moveAppointment.id))?.startAt, targetWindow.startAt);
  assert.equal((await repository.getBookingRequest(moveRequest.id))?.preferredWindowId, targetWindow.id);

  await reset(makeSnapshot({
    appointments: [makeAppointment("apt-past-move", "req-past-move", pastRange().startAt, pastRange().endAt)],
    clients: [baseClient],
    requests: [makeRequest("req-past-move", "win-past-reserved", "confirmed")],
    services: [baseService],
    windows: [
      makeWindow("win-past-reserved", pastRange().startAt, pastRange().endAt, "reserved"),
      makeWindow("win-future-target", futureRange("18:00", "19:00").startAt, futureRange("18:00", "19:00").endAt),
    ],
  }));
  await assert.rejects(
    () => repository.moveAppointment("apt-past-move", "win-future-target"),
    /будущую|future/i,
  );

  await reset(makeSnapshot({
    appointments: [makeAppointment("apt-future-move", "req-future-move", futureRange("10:00", "11:00").startAt, futureRange("10:00", "11:00").endAt)],
    clients: [baseClient],
    requests: [makeRequest("req-future-move", "win-future-reserved", "confirmed")],
    services: [baseService],
    windows: [
      makeWindow("win-future-reserved", futureRange("10:00", "11:00").startAt, futureRange("10:00", "11:00").endAt, "reserved"),
      makeWindow("win-past-target", pastRange("12:00", "13:00").startAt, pastRange("12:00", "13:00").endAt),
    ],
  }));
  await assert.rejects(
    () => repository.moveAppointment("apt-future-move", "win-past-target"),
    /свободное|future|available/i,
  );

  await reset(makeSnapshot({
    appointments: [makeAppointment("apt-ongoing-cancel", "req-ongoing-cancel", ongoingRange().startAt, ongoingRange().endAt)],
    clients: [baseClient],
    requests: [makeRequest("req-ongoing-cancel", "win-ongoing-reserved", "confirmed")],
    services: [baseService],
    windows: [makeWindow("win-ongoing-reserved", ongoingRange().startAt, ongoingRange().endAt, "reserved")],
  }));
  const cancelled = await repository.updateAppointmentStatus("apt-ongoing-cancel", "cancelled");
  assert.equal(cancelled?.item.status, "cancelled");
  assert.equal((await repository.getTimeWindow("win-ongoing-reserved"))?.status, "blocked");
  assert.equal((await repository.getBookingRequest("req-ongoing-cancel"))?.status, "declined");

  await reset(makeSnapshot({
    services: [baseService],
    windows: [
      makeWindow("old-unused", pastRange("09:00", "10:00").startAt, pastRange("09:00", "10:00").endAt),
      makeWindow("old-used-request", pastRange("11:00", "12:00").startAt, pastRange("11:00", "12:00").endAt, "offered"),
      makeWindow("old-used-appointment", pastRange("13:00", "14:00").startAt, pastRange("13:00", "14:00").endAt, "reserved"),
    ],
    clients: [baseClient],
    requests: [makeRequest("req-old-used", "old-used-request", "new")],
    appointments: [makeAppointment("apt-old-used", "req-old-appointment", pastRange("13:00", "14:00").startAt, pastRange("13:00", "14:00").endAt)],
  }));
  const cleanedSnapshot = await repository.getSnapshot();
  assert.equal(cleanedSnapshot.windows.some((window) => window.id === "old-unused"), false);
  assert.equal(cleanedSnapshot.windows.some((window) => window.id === "old-used-request"), true);
  assert.equal(cleanedSnapshot.windows.some((window) => window.id === "old-used-appointment"), true);

  await reset();
  await repository.createService(baseService);
  const legacyCreationWindow = makeWindow("win-legacy-create", futureRange("19:00", "20:00").startAt, futureRange("19:00", "20:00").endAt);
  await repository.createTimeWindow(legacyCreationWindow);
  await assert.rejects(
    () => createBookingPayload(repository, makeRequest("req-waiting-new-flow", legacyCreationWindow.id, "waiting_client")),
    /new|нов/i,
  );

  await reset(makeSnapshot({
    clients: [baseClient],
    requests: [makeRequest("req-legacy-valid", "win-legacy-valid", "waiting_client")],
    services: [baseService],
    windows: [makeWindow("win-legacy-valid", futureRange("20:00", "21:00").startAt, futureRange("20:00", "21:00").endAt, "offered")],
  }));
  const legacyConfirmed = await repository.confirmBookingRequest("req-legacy-valid");
  assert.equal(legacyConfirmed?.created, true);
  assert.equal((await repository.getTimeWindow("win-legacy-valid"))?.status, "reserved");

  await reset(makeSnapshot({
    clients: [baseClient],
    requests: [makeRequest("req-legacy-invalid", "win-legacy-invalid", "waiting_client")],
    services: [baseService],
    windows: [makeWindow("win-legacy-invalid", futureRange("21:00", "22:00").startAt, futureRange("21:00", "22:00").endAt, "available")],
  }));
  assert.equal(await repository.confirmBookingRequest("req-legacy-invalid"), null);
  assert.equal((await repository.getTimeWindow("win-legacy-invalid"))?.status, "available");
}

test("file repository protects booking/window/appointment invariants", async () => {
  await runCriticalRepositoryContract(fileRepository, resetFileRepository);
});

test("critical date logic does not bypass dateTime utils", async () => {
  const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
  const criticalRoots = [
    "server/http",
    "server/notifications",
    "server/repositories",
    "server/services",
    "src/app",
    "src/features",
  ];
  const forbiddenPatterns = [
    { pattern: /split\(["']T["']\)/, reason: "ISO date splitting bypasses local date utils" },
    { pattern: /Date\.parse/, reason: "Date.parse bypasses shared timestamp helpers" },
    { pattern: /new Date\(/, reason: "new Date belongs in dateTime/display/db mapping layers only" },
  ];
  const violations: string[] = [];

  for (const root of criticalRoots) {
    for (const filePath of await listSourceFiles(join(workspaceRoot, root))) {
      const text = await readFile(filePath, "utf8");
      for (const { pattern, reason } of forbiddenPatterns) {
        if (pattern.test(text)) {
          violations.push(`${relative(workspaceRoot, filePath)}: ${reason}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

if (process.env.TEST_DATABASE_URL) {
  test("postgres repository matches the same critical invariant contract", async () => {
    const postgresRepository = await import("../repositories/appRepository.js");
    const { pool } = await import("../db/pool.js");

    try {
      await runCriticalRepositoryContract(postgresRepository, async (snapshot = makeSnapshot()) => {
        await resetPostgresRepository(pool, snapshot);
      });
    } finally {
      await pool.end();
    }
  });
} else {
  test.skip("postgres repository matches the same critical invariant contract", () => {
    // Set TEST_DATABASE_URL to run the same contract against PostgreSQL.
  });
}

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      return [fullPath];
    }

    return [];
  }));

  return nested.flat();
}

async function resetPostgresRepository(
  pool: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  snapshot: AppSnapshot,
) {
  const schemaSql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await pool.query(schemaSql);
  await pool.query(`
    TRUNCATE appointments, booking_requests, time_windows, service_options, service_presets, photo_attachments, clients
    RESTART IDENTITY CASCADE
  `);

  for (const client of snapshot.clients) {
    await pool.query(
      `INSERT INTO clients
        (id, name, phone, preferred_contact_channel, contact_handle, first_visit, telegram_user_id, notes, archived_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        client.id,
        client.name,
        client.phone,
        client.preferredContactChannel,
        client.contactHandle,
        client.firstVisit,
        client.telegramUserId ?? null,
        client.notes ?? null,
        client.archivedAt ?? null,
      ],
    );
  }

  for (const photo of snapshot.photos) {
    await pool.query(
      "INSERT INTO photo_attachments (id, kind, file_name, preview_url) VALUES ($1, $2, $3, $4)",
      [photo.id, photo.kind, photo.fileName, photo.previewUrl ?? null],
    );
  }

  for (const service of snapshot.services) {
    await pool.query(
      `INSERT INTO service_presets
        (id, title, duration_minutes, price_from, requires_hand_photo, requires_reference, allows_length_selection, options)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        service.id,
        service.title,
        service.durationMinutes,
        service.priceFrom ?? null,
        service.requiresHandPhoto,
        service.requiresReference,
        service.allowsLengthSelection ?? true,
        JSON.stringify(service.options),
      ],
    );
  }

  for (const option of snapshot.serviceOptions) {
    await pool.query(
      "INSERT INTO service_options (id, title, duration_minutes, price_from) VALUES ($1, $2, $3, $4)",
      [option.id, option.title, option.durationMinutes, option.priceFrom ?? null],
    );
  }

  for (const window of snapshot.windows) {
    await pool.query(
      "INSERT INTO time_windows (id, start_at, end_at, status, label) VALUES ($1, $2, $3, $4, $5)",
      [window.id, window.startAt, window.endAt, window.status, window.label],
    );
  }

  for (const request of snapshot.requests) {
    await pool.query(
      `INSERT INTO booking_requests
        (
          id, public_token, client_id, service, option_ids, length, desired_result, photo_ids,
          preferred_window_id, custom_window_text, comment, estimated_minutes,
          estimated_price_from, status, created_at, master_note, clarification_question
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        request.id,
        request.publicToken ?? `token-${request.id}`,
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
  }

  for (const appointment of snapshot.appointments) {
    await pool.query(
      `INSERT INTO appointments
        (
          id, public_token, request_id, client_id, service, option_ids, start_at, end_at,
          duration_minutes, status, master_note, reminder_24h_sent_at, reminder_3h_sent_at,
          survey_sent_at, survey_rating, survey_text, cancelled_at
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        appointment.id,
        appointment.publicToken ?? `apt-token-${appointment.id}`,
        appointment.requestId,
        appointment.clientId,
        appointment.service,
        JSON.stringify(appointment.optionIds),
        appointment.startAt,
        appointment.endAt,
        appointment.durationMinutes,
        appointment.status,
        appointment.masterNote ?? null,
        appointment.reminder24hSentAt ?? null,
        appointment.reminder3hSentAt ?? null,
        appointment.surveySentAt ?? null,
        appointment.surveyRating ?? null,
        appointment.surveyText ?? null,
        appointment.cancelledAt ?? null,
      ],
    );
  }
}
