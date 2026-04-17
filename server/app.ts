import cors from "cors";
import express from "express";
import { attachTelegramAuth } from "./auth/telegram.js";
import { config } from "./config.js";
import { adminRoutes } from "./http/adminRoutes.js";
import { bookingRoutes } from "./http/bookingRoutes.js";
import { errorHandler } from "./http/errorHandler.js";
import { publicRoutes } from "./http/publicRoutes.js";
import { telegramRoutes } from "./http/telegramRoutes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "10mb" }));
  app.use(attachTelegramAuth);
  app.use("/uploads", express.static(config.uploadsDir));

  app.use(telegramRoutes);
  app.use(publicRoutes);
  app.use(bookingRoutes);
  app.use(adminRoutes);
  app.use(errorHandler);

  return app;
}
