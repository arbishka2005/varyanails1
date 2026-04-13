import { config } from "../config.js";
import type { Client } from "../../src/types.js";

type NotifyPayload = {
  title: string;
  lines: string[];
};

function formatMessage(payload: NotifyPayload) {
  const header = `Уведомление: ${payload.title}`;
  return [header, ...payload.lines].filter(Boolean).join("\n");
}

async function sendMessage(chatId: string, text: string) {
  if (!config.telegramBotToken) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram notify failed:", response.status, body);
  }
}

export async function notifyMasters(payload: NotifyPayload) {
  if (!config.telegramBotToken || config.masterTelegramIds.length === 0) {
    return;
  }

  const message = formatMessage(payload);
  await Promise.all(config.masterTelegramIds.map((id) => sendMessage(id, message)));
}

export async function notifyClient(client: Client | null | undefined, payload: NotifyPayload) {
  if (!config.telegramBotToken || !client?.telegramUserId) {
    return;
  }

  const message = formatMessage(payload);
  await sendMessage(client.telegramUserId, message);
}
