import express from "express";
import { config } from "../config.js";
import { repository } from "../repositories/index.js";
import {
  confirmRequestByClientTokenCommand,
  submitAppointmentSurveyCommand,
} from "../services/bookingCommands.js";
import { sendCommandResult, sendError } from "./respond.js";
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
    sendError(response, 404, "Booking request not found");
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
    sendError(response, 404, "Appointment not found");
    return;
  }

  response.json(appointment);
});

publicRoutes.post("/api/public/booking-requests/:id/confirm", async (request, response) => {
  sendCommandResult(response, await confirmRequestByClientTokenCommand(getParamId(request)));
});

publicRoutes.post("/api/public/appointments/:id/survey", async (request, response) => {
  const payload = appointmentSurveySchema.parse(request.body);
  sendCommandResult(response, await submitAppointmentSurveyCommand(getParamId(request), payload));
});
