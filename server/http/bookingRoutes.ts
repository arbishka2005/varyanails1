import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { repository } from "../repositories/index.js";
import { notifyBookingRequestCreated } from "./bookingEvents.js";
import { createBookingRequestSchema, uploadPhotoSchema } from "./schemas.js";

export const bookingRoutes = express.Router();

bookingRoutes.post("/api/booking-requests", async (request, response) => {
  const payload = createBookingRequestSchema.parse(request.body);
  const telegramUserId = request.telegramUser?.id ? String(request.telegramUser.id) : undefined;
  const client = telegramUserId ? { ...payload.client, telegramUserId } : payload.client;

  const access = await repository.createBookingRequest({ ...payload, client });
  void notifyBookingRequestCreated({ request: payload.request, client });
  response.status(201).json({ ok: true, ...access });
});

bookingRoutes.post("/api/photos", async (request, response) => {
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
