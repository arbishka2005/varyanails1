import { config } from "../config.js";
import type { Client } from "../../src/types.js";
import type { NotificationPayload } from "./templates.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatMessage(payload: NotificationPayload) {
  const header = `${payload.accent ?? "\u2728"} <b>${escapeHtml(payload.title)}</b>`;
  const body = payload.lines
    .filter(Boolean)
    .map((line, index) => `${index === 0 ? "" : "• "}${escapeHtml(line)}`)
    .join("\n");

  return [header, body].filter(Boolean).join("\n\n");
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  if (!config.telegramBotToken) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram notify failed:", response.status, body);
  }
}

export async function notifyMasters(payload: NotificationPayload) {
  if (!config.telegramBotToken || config.masterTelegramIds.length === 0) {
    return;
  }

  const message = formatMessage(payload);
  await Promise.all(
    config.masterTelegramIds.map((id) => sendTelegramMessage(id, message, payload.replyMarkup)),
  );
}

export async function notifyClient(client: Client | null | undefined, payload: NotificationPayload) {
  if (!config.telegramBotToken || !client?.telegramUserId) {
    return;
  }

  const message = formatMessage(payload);
  await sendTelegramMessage(client.telegramUserId, message, payload.replyMarkup);
}
