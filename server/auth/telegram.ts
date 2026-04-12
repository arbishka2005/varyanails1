import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
      isMaster?: boolean;
    }
  }
}

export function verifyTelegramInitData(initData: string) {
  if (!config.telegramBotToken) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(config.telegramBotToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(hash, "hex"))) {
    return null;
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  const maxAgeSeconds = 60 * 60 * 24;

  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    return null;
  }

  const rawUser = params.get("user");

  if (!rawUser) {
    return null;
  }

  return JSON.parse(rawUser) as TelegramUser;
}

export function attachTelegramAuth(request: Request, _response: Response, next: NextFunction) {
  const initData = request.header("x-telegram-init-data");
  const devTelegramId = request.header("x-dev-telegram-id");

  if (initData) {
    const user = verifyTelegramInitData(initData);
    if (user) {
      request.telegramUser = user;
      request.isMaster = config.masterTelegramIds.includes(String(user.id));
    }
  }

  if (!request.telegramUser && config.allowDevAuth && devTelegramId) {
    request.telegramUser = { id: Number(devTelegramId), username: "dev-master" };
    request.isMaster = config.masterTelegramIds.includes(devTelegramId);
  }

  next();
}

export function requireMaster(request: Request, response: Response, next: NextFunction) {
  if (config.allowDevAuth && config.masterTelegramIds.length === 0) {
    request.isMaster = true;
    next();
    return;
  }

  if (!request.isMaster) {
    response.status(403).json({ error: "Master access required" });
    return;
  }

  next();
}
