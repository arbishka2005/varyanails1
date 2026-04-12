import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { attachTelegramAuth, requireMaster } from "./auth/telegram.js";
import { repository } from "./repositories/index.js";
import {
  createBookingRequestSchema,
  createTimeWindowSchema,
  updateClientNotesSchema,
  updateRequestStatusSchema,
  updateRequestWindowSchema,
  updateServiceSchema,
  updateTimeWindowStatusSchema,
} from "./http/schemas.js";

const app = express();

function getParamId(request: express.Request) {
  const id = request.params.id;
  return Array.isArray(id) ? id[0] : id;
}

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "10mb" }));
app.use(attachTelegramAuth);

app.get("/health", async (_request, response) => {
  response.json({ ok: true, storage: config.storageDriver });
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

app.post("/api/booking-requests", async (request, response) => {
  const payload = createBookingRequestSchema.parse(request.body);
  await repository.createBookingRequest(payload);
  response.status(201).json({ ok: true });
});

app.patch("/api/booking-requests/:id/status", requireMaster, async (request, response) => {
  const payload = updateRequestStatusSchema.parse(request.body);
  const updated = await repository.updateRequestStatus(getParamId(request), payload.status);

  if (!updated) {
    response.status(404).json({ error: "Booking request not found" });
    return;
  }

  response.json(updated);
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

  response.json(updated);
});

app.post("/api/booking-requests/:id/confirm", requireMaster, async (request, response) => {
  const appointment = await repository.confirmBookingRequest(getParamId(request));

  if (!appointment) {
    response.status(409).json({ error: "Request cannot be confirmed" });
    return;
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

app.patch("/api/services/:id", requireMaster, async (request, response) => {
  const payload = updateServiceSchema.parse(request.body);
  const updated = await repository.updateService(getParamId(request), payload);

  if (!updated) {
    response.status(404).json({ error: "Service not found" });
    return;
  }

  response.json(updated);
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

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Validation failed", issues: error.issues });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`Varya Nails API listening on http://127.0.0.1:${config.port}`);
});

void repository.bootstrapSeedData().catch((error) => {
  console.error("Failed to bootstrap seed data:", error);
});
