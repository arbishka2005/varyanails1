import express from "express";
import { config } from "../config.js";
import { repository } from "../repositories/index.js";
import { notifyBookingConfirmed } from "./bookingEvents.js";
import { appointmentSurveySchema } from "./schemas.js";
import { buildVersionedWebAppUrl, getParamId } from "./utils.js";

export const publicRoutes = express.Router();

publicRoutes.get("/health", async (_request, response) => {
  response.json({ ok: true, storage: config.storageDriver });
});

publicRoutes.get("/launch", (request, response) => {
  response.redirect(302, buildVersionedWebAppUrl(request));
});

publicRoutes.get("/launch/admin", (request, response) => {
  response.redirect(302, buildVersionedWebAppUrl(request, "admin"));
});

publicRoutes.get("/api/public/booking-config", async (_request, response) => {
  response.json(await repository.getPublicBookingConfig());
});

publicRoutes.get("/api/public/booking-requests/:id", async (request, response) => {
  const bookingRequest = await repository.getBookingRequestByPublicToken(getParamId(request));

  if (!bookingRequest) {
    response.status(404).json({ error: "Booking request not found" });
    return;
  }

  const window = bookingRequest.preferredWindowId
    ? await repository.getTimeWindow(bookingRequest.preferredWindowId)
    : null;

  response.json({ request: bookingRequest, window });
});

publicRoutes.get("/api/public/appointments/:id", async (request, response) => {
  const appointment = await repository.getAppointmentByPublicToken(getParamId(request));

  if (!appointment) {
    response.status(404).json({ error: "Appointment not found" });
    return;
  }

  response.json(appointment);
});

publicRoutes.post("/api/public/booking-requests/:id/confirm", async (request, response) => {
  const appointment = await repository.confirmBookingRequestByPublicToken(getParamId(request));

  if (!appointment) {
    response.status(409).json({ error: "Request cannot be confirmed by client" });
    return;
  }

  void notifyBookingConfirmed(appointment, "client");
  response.status(201).json(appointment);
});

publicRoutes.post("/api/public/appointments/:id/survey", async (request, response) => {
  const payload = appointmentSurveySchema.parse(request.body);
  const appointment = await repository.getAppointmentByPublicToken(getParamId(request));

  if (!appointment) {
    response.status(404).json({ error: "Appointment not found" });
    return;
  }

  if (appointment.surveyRating) {
    response.status(409).json({ error: "Survey already submitted" });
    return;
  }

  const updated = await repository.submitAppointmentSurveyByPublicToken(getParamId(request), payload);
  response.status(201).json(updated);
});
