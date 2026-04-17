import type express from "express";
import { config } from "../config.js";

export function getParamId(request: express.Request) {
  const id = request.params.id;
  return Array.isArray(id) ? id[0] : id;
}

export function getCommandName(text: string) {
  const raw = text.trim().split(/\s+/)[0] ?? "";

  if (!raw.startsWith("/")) {
    return "";
  }

  const trimmed = raw.replace(/^\/+/, "");
  return (trimmed.split("@")[0] ?? "").toLowerCase();
}

function getLaunchUrl(mode?: "admin") {
  const base = config.appBaseUrl.replace(/\/+$/, "");
  return mode === "admin" ? `${base}/launch/admin` : `${base}/launch`;
}

export function buildLaunchReplyMarkup(mode?: "admin") {
  return {
    inline_keyboard: [
      [{ text: mode === "admin" ? "Открыть админ-панель" : "Открыть запись", web_app: { url: getLaunchUrl(mode) } }],
    ],
  };
}

export function buildVersionedWebAppUrl(request: express.Request, mode?: "admin") {
  const base = `${request.protocol}://${request.get("host")}`.replace(/\/+$/, "");
  const params = new URLSearchParams({ v: config.appVersion });

  if (mode === "admin") {
    params.set("startapp", "admin");
  }

  return `${base}/?${params.toString()}`;
}
