import express from "express";
import { repository } from "../repositories/index.js";
import { savePhotoUpload } from "../services/photoUploads.js";
import { notifyBookingRequestCreated } from "./bookingEvents.js";
import { createBookingRequestSchema, uploadPhotoSchema } from "./schemas.js";

export const bookingRoutes = express.Router();

function dispatchNotification(task: Promise<void>) {
  task.catch((error: unknown) => {
    console.error("Notification dispatch failed:", error);
  });
}

bookingRoutes.post("/api/booking-requests", async (request, response) => {
  const payload = createBookingRequestSchema.parse(request.body);
  const telegramUserId = request.telegramUser?.id ? String(request.telegramUser.id) : undefined;
  const client = telegramUserId ? { ...payload.client, telegramUserId } : payload.client;

  const access = await repository.createBookingRequest({ ...payload, client });
  dispatchNotification(notifyBookingRequestCreated({ request: payload.request, client }));
  response.status(201).json({ ok: true, ...access });
});

bookingRoutes.post("/api/photos", async (request, response) => {
  const payload = uploadPhotoSchema.parse(request.body);
  const baseUrl = `${request.protocol}://${request.get("host")}`;
  const photo = await savePhotoUpload({
    kind: payload.kind,
    originalFileName: payload.fileName,
    dataUrl: payload.dataUrl,
    baseUrl,
  });

  response.status(201).json(photo);
});
