import express from "express";
import { requireMaster } from "../auth/telegram.js";
import { repository } from "../repositories/index.js";
import {
  notifyAppointmentCancelled,
  notifyAppointmentMoved,
  notifyBookingConfirmed,
  notifyRequestStatusChanged,
  notifyRequestWindowChanged,
} from "./bookingEvents.js";
import {
  createServiceSchema,
  createServiceOptionSchema,
  createTimeWindowSchema,
  moveAppointmentSchema,
  updateAppointmentStatusSchema,
  updateClientNotesSchema,
  updateRequestStatusSchema,
  updateRequestWindowSchema,
  updateServiceOptionSchema,
  updateServiceSchema,
  updateTimeWindowStatusSchema,
} from "./schemas.js";
import { getParamId } from "./utils.js";

export const adminRoutes = express.Router();

adminRoutes.post("/api/bootstrap", requireMaster, async (_request, response) => {
  await repository.bootstrapSeedData();
  response.status(201).json({ ok: true });
});

adminRoutes.get("/api/snapshot", requireMaster, async (_request, response) => {
  response.json(await repository.getSnapshot());
});

adminRoutes.patch("/api/booking-requests/:id/status", requireMaster, async (request, response) => {
  const payload = updateRequestStatusSchema.parse(request.body);
  const updated = await repository.updateRequestStatus(getParamId(request), payload.status);

  if (!updated) {
    response.status(404).json({ error: "Booking request not found" });
    return;
  }

  void notifyRequestStatusChanged(updated);
  response.json(updated);
});

adminRoutes.patch("/api/booking-requests/:id/window", requireMaster, async (request, response) => {
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

  void notifyRequestWindowChanged(updated);
  response.json(updated);
});

adminRoutes.post("/api/booking-requests/:id/confirm", requireMaster, async (request, response) => {
  const appointment = await repository.confirmBookingRequest(getParamId(request));

  if (!appointment) {
    response.status(409).json({ error: "Request cannot be confirmed" });
    return;
  }

  void notifyBookingConfirmed(appointment, "master");
  response.status(201).json(appointment);
});

adminRoutes.patch("/api/appointments/:id/status", requireMaster, async (request, response) => {
  const payload = updateAppointmentStatusSchema.parse(request.body);
  const updated = await repository.updateAppointmentStatus(getParamId(request), payload.status);

  if (!updated) {
    response.status(404).json({ error: "Appointment not found" });
    return;
  }

  if (updated.status === "cancelled") {
    void notifyAppointmentCancelled(updated);
  }

  response.json(updated);
});

adminRoutes.patch("/api/appointments/:id/window", requireMaster, async (request, response) => {
  const payload = moveAppointmentSchema.parse(request.body);
  const updated = await repository.moveAppointment(getParamId(request), payload.windowId);

  if (!updated) {
    response.status(409).json({ error: "Appointment cannot be moved" });
    return;
  }

  void notifyAppointmentMoved(updated, payload.windowId);
  response.json(updated);
});

adminRoutes.delete("/api/appointments/:id", requireMaster, async (request, response) => {
  const deleted = await repository.deleteAppointment(getParamId(request));

  if (!deleted) {
    response.status(404).json({ error: "Appointment not found" });
    return;
  }

  response.status(204).end();
});

adminRoutes.patch("/api/clients/:id/notes", requireMaster, async (request, response) => {
  const payload = updateClientNotesSchema.parse(request.body);
  const updated = await repository.updateClientNotes(getParamId(request), payload.notes);

  if (!updated) {
    response.status(404).json({ error: "Client not found" });
    return;
  }

  response.json(updated);
});

adminRoutes.delete("/api/clients/:id", requireMaster, async (request, response) => {
  const deleted = await repository.deleteClient(getParamId(request));

  if (!deleted) {
    response.status(404).json({ error: "Client not found" });
    return;
  }

  response.status(204).end();
});

adminRoutes.post("/api/services", requireMaster, async (request, response) => {
  const payload = createServiceSchema.parse(request.body);
  const created = await repository.createService(payload);
  response.status(201).json(created);
});

adminRoutes.patch("/api/services/:id", requireMaster, async (request, response) => {
  const payload = updateServiceSchema.parse(request.body);
  const updated = await repository.updateService(getParamId(request), payload);

  if (!updated) {
    response.status(404).json({ error: "Service not found" });
    return;
  }

  response.json(updated);
});

adminRoutes.delete("/api/services/:id", requireMaster, async (request, response) => {
  const deleted = await repository.deleteService(getParamId(request));

  if (!deleted) {
    response.status(404).json({ error: "Service not found" });
    return;
  }

  response.status(204).end();
});

adminRoutes.post("/api/service-options", requireMaster, async (request, response) => {
  const payload = createServiceOptionSchema.parse(request.body);
  const created = await repository.createServiceOption(payload);
  response.status(201).json(created);
});

adminRoutes.patch("/api/service-options/:id", requireMaster, async (request, response) => {
  const payload = updateServiceOptionSchema.parse(request.body);
  const updated = await repository.updateServiceOption(getParamId(request), payload);

  if (!updated) {
    response.status(404).json({ error: "Service option not found" });
    return;
  }

  response.json(updated);
});

adminRoutes.delete("/api/service-options/:id", requireMaster, async (request, response) => {
  const deleted = await repository.deleteServiceOption(getParamId(request));

  if (!deleted) {
    response.status(404).json({ error: "Service option not found" });
    return;
  }

  response.status(204).end();
});

adminRoutes.post("/api/time-windows", requireMaster, async (request, response) => {
  const payload = createTimeWindowSchema.parse(request.body);
  response.status(201).json(await repository.createTimeWindow(payload));
});

adminRoutes.patch("/api/time-windows/:id/status", requireMaster, async (request, response) => {
  const payload = updateTimeWindowStatusSchema.parse(request.body);
  const updated = await repository.updateTimeWindowStatus(getParamId(request), payload.status);

  if (!updated) {
    response.status(404).json({ error: "Time window not found" });
    return;
  }

  response.json(updated);
});
