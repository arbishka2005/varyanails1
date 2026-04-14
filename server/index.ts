import cors from "cors";
import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ZodError } from "zod";
import { config } from "./config.js";
import { attachTelegramAuth, requireMaster } from "./auth/telegram.js";
import { runMigrations } from "./db/migrate.js";
import { repository } from "./repositories/index.js";
import { notifyClient, notifyMasters, sendTelegramMessage } from "./notifications/telegram.js";
import { startAppointmentScheduler } from "./notifications/scheduler.js";
import {
  appointmentSurveySchema,
  createServiceSchema,
  createServiceOptionSchema,
  createBookingRequestSchema,
  createTimeWindowSchema,
  uploadPhotoSchema,
  updateAppointmentStatusSchema,
  updateClientNotesSchema,
  updateRequestStatusSchema,
  updateRequestWindowSchema,
  moveAppointmentSchema,
  updateServiceSchema,
  updateServiceOptionSchema,
  updateTimeWindowStatusSchema,
} from "./http/schemas.js";

const app = express();
app.set("trust proxy", true);

function getParamId(request: express.Request) {
  const id = request.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function getCommandName(text: string) {
  const raw = text.trim().split(/\s+/)[0] ?? "";
  if (!raw.startsWith("/")) {
    return "";
  }
  const trimmed = raw.replace(/^\/+/, "");
  return trimmed.split("@")[0] ?? "";
}

function getAdminWebAppUrl() {
  const base = config.appBaseUrl.replace(/\/+$/, "");
  return `${base}/?startapp=admin`;
}

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "10mb" }));
app.use(attachTelegramAuth);
app.use("/uploads", express.static(config.uploadsDir));

app.get("/health", async (_request, response) => {
  response.json({ ok: true, storage: config.storageDriver });
});

app.post("/api/telegram/webhook", async (request, response) => {
  if (!config.telegramBotToken) {
    response.json({ ok: true });
    return;
  }

  const update = request.body ?? {};
  const message = update.message ?? update.edited_message;
  const text = typeof message?.text === "string" ? message.text : "";
  const fromId = message?.from?.id;
  const chatId = message?.chat?.id ?? fromId;

  if (!text || !fromId || !chatId) {
    response.json({ ok: true });
    return;
  }

  const command = getCommandName(text);

  if (command === "admin") {
    const isMaster = config.masterTelegramIds.includes(String(fromId));

    if (!isMaster) {
      await sendTelegramMessage(String(chatId), "Нет доступа к админ-панели.");
      response.json({ ok: true });
      return;
    }

    await sendTelegramMessage(String(chatId), "Открыть админ-панель:", {
      inline_keyboard: [
        [{ text: "Открыть админку", web_app: { url: getAdminWebAppUrl() } }],
      ],
    });
  }

  response.json({ ok: true });
});

app.post("/api/bootstrap", requireMaster, async (_request, response) => {
  await repository.bootstrapSeedData();
  response.status(201).json({ ok: true });
});

app.get("/api/snapshot", requireMaster, async (_request, response) => {
  response.json(await repository.getSnapshot());
});

app.get("/api/public/booking-config", async (_request, response) => {
  response.json(await repository.getPublicBookingConfig());
});

app.get("/api/public/booking-requests/:id", async (request, response) => {
  const bookingRequest = await repository.getBookingRequest(getParamId(request));

  if (!bookingRequest) {
    response.status(404).json({ error: "Booking request not found" });
    return;
  }

  const window = bookingRequest.preferredWindowId
    ? await repository.getTimeWindow(bookingRequest.preferredWindowId)
    : null;

  response.json({ request: bookingRequest, window });
});

app.get("/api/public/appointments/:id", async (request, response) => {
  const appointment = await repository.getAppointment(getParamId(request));

  if (!appointment) {
    response.status(404).json({ error: "Appointment not found" });
    return;
  }

  response.json(appointment);
});

app.post("/api/booking-requests", async (request, response) => {
  const payload = createBookingRequestSchema.parse(request.body);
  const telegramUserId = request.telegramUser?.id ? String(request.telegramUser.id) : undefined;
  const client = telegramUserId ? { ...payload.client, telegramUserId } : payload.client;
  await repository.createBookingRequest({ ...payload, client });
  const window = payload.request.preferredWindowId
    ? await repository.getTimeWindow(payload.request.preferredWindowId)
    : null;
  void notifyMasters({
    title: "Новая заявка",
    lines: [
      `Заявка: ${payload.request.id}`,
      `Клиент: ${payload.client.name}`,
      `Телефон: ${payload.client.phone}`,
      `Услуга: ${payload.request.service}`,
      window ? `Окно: ${window.label}` : "Окно: нужно согласовать",
    ],
  });
  response.status(201).json({ ok: true });
});

app.post("/api/photos", async (request, response) => {
  const payload = uploadPhotoSchema.parse(request.body);
  const match = payload.dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    response.status(400).json({ error: "Invalid data URL" });
    return;
  }

  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length > 5 * 1024 * 1024) {
    response.status(413).json({ error: "File too large" });
    return;
  }

  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : null;

  if (!extension) {
    response.status(400).json({ error: "Unsupported file type" });
    return;
  }

  const id = `PHOTO-${payload.kind.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${id}.${extension}`;
  await mkdir(config.uploadsDir, { recursive: true });
  await writeFile(join(config.uploadsDir, fileName), buffer);

  const baseUrl = `${request.protocol}://${request.get("host")}`;
  response.status(201).json({
    id,
    kind: payload.kind,
    fileName: payload.fileName,
    previewUrl: `${baseUrl}/uploads/${fileName}`,
  });
});

app.patch("/api/booking-requests/:id/status", requireMaster, async (request, response) => {
  const payload = updateRequestStatusSchema.parse(request.body);
  const updated = await repository.updateRequestStatus(getParamId(request), payload.status);

  if (!updated) {
    response.status(404).json({ error: "Booking request not found" });
    return;
  }

  if (updated) {
    const client = await repository.getClient(updated.clientId);
    void notifyMasters({
      title: "Статус заявки изменен",
      lines: [
        `Заявка: ${updated.id}`,
        `Статус: ${updated.status}`,
        client ? `Клиент: ${client.name}` : "",
      ],
    });
  }

  response.json(updated);
});

app.patch("/api/appointments/:id/status", requireMaster, async (request, response) => {
  const payload = updateAppointmentStatusSchema.parse(request.body);
  const updated = await repository.updateAppointmentStatus(getParamId(request), payload.status);

  if (!updated) {
    response.status(404).json({ error: "Appointment not found" });
    return;
  }

  if (updated.status === "cancelled") {
    const client = await repository.getClient(updated.clientId);
    void notifyClient(client, {
      title: "Запись отменена",
      lines: [
        "Запись была отменена.",
        "Если нужно подобрать другое время, напишите мастеру.",
      ],
    });
  }

  response.json(updated);
});

app.post("/api/public/appointments/:id/survey", async (request, response) => {
  const payload = appointmentSurveySchema.parse(request.body);
  const appointment = await repository.getAppointment(getParamId(request));

  if (!appointment) {
    response.status(404).json({ error: "Appointment not found" });
    return;
  }

  if (appointment.surveyRating) {
    response.status(409).json({ error: "Survey already submitted" });
    return;
  }

  const updated = await repository.submitAppointmentSurvey(appointment.id, payload);
  response.status(201).json(updated);
});

app.patch("/api/booking-requests/:id/window", requireMaster, async (request, response) => {
  const payload = updateRequestWindowSchema.parse(request.body);
  const updated = await repository.updateRequestWindow(
    getParamId(request),
    payload.preferredWindowId,
    payload.customWindowText,
  );

  if (!updated) {
    response.status(404).json({ error: "Booking request not found" });
    return;
  }

  if (updated) {
    const client = await repository.getClient(updated.clientId);
    const window = updated.preferredWindowId
      ? await repository.getTimeWindow(updated.preferredWindowId)
      : null;
    void notifyMasters({
      title: "Предложено другое окно",
      lines: [
        `Заявка: ${updated.id}`,
        client ? `Клиент: ${client.name}` : "",
        window ? `Окно: ${window.label}` : "Окно: нужно согласовать",
      ],
    });
  }

  response.json(updated);
});

app.post("/api/booking-requests/:id/confirm", requireMaster, async (request, response) => {
  const appointment = await repository.confirmBookingRequest(getParamId(request));

  if (!appointment) {
    response.status(409).json({ error: "Request cannot be confirmed" });
    return;
  }

  if (appointment) {
    const client = await repository.getClient(appointment.clientId);
    void notifyMasters({
      title: "Заявка подтверждена мастером",
      lines: [
        `Заявка: ${appointment.requestId}`,
        client ? `Клиент: ${client.name}` : "",
        `Время: ${appointment.startAt}`,
      ],
    });
  }

  response.status(201).json(appointment);
});

app.post("/api/public/booking-requests/:id/confirm", async (request, response) => {
  const appointment = await repository.confirmBookingRequestByClient(getParamId(request));

  if (!appointment) {
    response.status(409).json({ error: "Request cannot be confirmed by client" });
    return;
  }

  if (appointment) {
    const client = await repository.getClient(appointment.clientId);
    void notifyMasters({
      title: "Клиент подтвердил окно",
      lines: [
        `Заявка: ${appointment.requestId}`,
        client ? `Клиент: ${client.name}` : "",
        `Время: ${appointment.startAt}`,
      ],
    });
  }

  response.status(201).json(appointment);
});

app.patch("/api/clients/:id/notes", requireMaster, async (request, response) => {
  const payload = updateClientNotesSchema.parse(request.body);
  const updated = await repository.updateClientNotes(getParamId(request), payload.notes);

  if (!updated) {
    response.status(404).json({ error: "Client not found" });
    return;
  }

  response.json(updated);
});

app.delete("/api/clients/:id", requireMaster, async (request, response) => {
  const deleted = await repository.deleteClient(getParamId(request));

  if (!deleted) {
    response.status(404).json({ error: "Client not found" });
    return;
  }

  response.status(204).end();
});

app.patch("/api/services/:id", requireMaster, async (request, response) => {
  const payload = updateServiceSchema.parse(request.body);
  const updated = await repository.updateService(getParamId(request), payload);

  if (!updated) {
    response.status(404).json({ error: "Service not found" });
    return;
  }

  response.json(updated);
});

app.post("/api/services", requireMaster, async (request, response) => {
  const payload = createServiceSchema.parse(request.body);
  const created = await repository.createService(payload);
  response.status(201).json(created);
});

app.delete("/api/services/:id", requireMaster, async (request, response) => {
  const deleted = await repository.deleteService(getParamId(request));

  if (!deleted) {
    response.status(404).json({ error: "Service not found" });
    return;
  }

  response.status(204).end();
});

app.post("/api/service-options", requireMaster, async (request, response) => {
  const payload = createServiceOptionSchema.parse(request.body);
  const created = await repository.createServiceOption(payload);
  response.status(201).json(created);
});

app.patch("/api/service-options/:id", requireMaster, async (request, response) => {
  const payload = updateServiceOptionSchema.parse(request.body);
  const updated = await repository.updateServiceOption(getParamId(request), payload);

  if (!updated) {
    response.status(404).json({ error: "Service option not found" });
    return;
  }

  response.json(updated);
});

app.delete("/api/service-options/:id", requireMaster, async (request, response) => {
  const deleted = await repository.deleteServiceOption(getParamId(request));

  if (!deleted) {
    response.status(404).json({ error: "Service option not found" });
    return;
  }

  response.status(204).end();
});

app.post("/api/time-windows", requireMaster, async (request, response) => {
  const payload = createTimeWindowSchema.parse(request.body);
  response.status(201).json(await repository.createTimeWindow(payload));
});

app.patch("/api/time-windows/:id/status", requireMaster, async (request, response) => {
  const payload = updateTimeWindowStatusSchema.parse(request.body);
  const updated = await repository.updateTimeWindowStatus(getParamId(request), payload.status);

  if (!updated) {
    response.status(404).json({ error: "Time window not found" });
    return;
  }

  response.json(updated);
});

app.patch("/api/appointments/:id/window", requireMaster, async (request, response) => {
  const payload = moveAppointmentSchema.parse(request.body);
  const updated = await repository.moveAppointment(getParamId(request), payload.windowId);

  if (!updated) {
    response.status(409).json({ error: "Appointment cannot be moved" });
    return;
  }

  const client = await repository.getClient(updated.clientId);
  const window = await repository.getTimeWindow(payload.windowId);
  void notifyMasters({
    title: "Запись перенесена",
    lines: [
      `Запись: ${updated.id}`,
      client ? `Клиент: ${client.name}` : "",
      window ? `Новое окно: ${window.label}` : "",
    ],
  });

  if (window) {
    void notifyClient(client, {
      title: "Запись перенесена",
      lines: [
        "Мы перенесли вашу запись.",
        `Новое время: ${window.label}`,
        "Если время не подходит, напишите мастеру.",
      ],
    });
  }

  response.json(updated);
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Validation failed", issues: error.issues });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

async function start() {
  if (config.storageDriver === "postgres") {
    await runMigrations();
  }

  await repository.bootstrapSeedData();
  startAppointmentScheduler({
    repository,
    notifyClient,
    appBaseUrl: config.appBaseUrl,
  });

  app.listen(config.port, () => {
    console.log(`Varya Nails API listening on http://127.0.0.1:${config.port}`);
  });
}

void start().catch((error) => {
  console.error("Failed to start API:", error);
});
