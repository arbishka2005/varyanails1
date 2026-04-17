import express from "express";
import { config } from "../config.js";
import { sendTelegramMessage } from "../notifications/telegram.js";
import { buildLaunchReplyMarkup, getCommandName } from "./utils.js";

export const telegramRoutes = express.Router();

telegramRoutes.post("/api/telegram/webhook", async (request, response) => {
  if (!config.telegramBotToken) {
    response.json({ ok: true });
    return;
  }

  const update = request.body ?? {};
  const message = update.message ?? update.edited_message;
  const text = typeof message?.text === "string" ? message.text : "";
  const fromId = message?.from?.id;
  const chatId = message?.chat?.id ?? fromId;

  if (!text || !fromId || !chatId) {
    response.json({ ok: true });
    return;
  }

  const command = getCommandName(text);

  if (command === "admin") {
    const isMaster = config.masterTelegramIds.includes(String(fromId));

    if (!isMaster) {
      await sendTelegramMessage(String(chatId), "Нет доступа к админ-панели.");
      response.json({ ok: true });
      return;
    }

    await sendTelegramMessage(String(chatId), "Открыть админ-панель:", buildLaunchReplyMarkup("admin"));
  }

  response.json({ ok: true });
});
