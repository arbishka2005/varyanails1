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
  const commandPayload = text.trim().split(/\s+/).slice(1).join(" ").toLowerCase();

  const isMaster = config.masterTelegramIds.includes(String(fromId));

  if (command === "admin" || (command === "start" && commandPayload === "admin")) {
    if (!isMaster) {
      await sendTelegramMessage(
        String(chatId),
        [
          "Админ-панель доступна только мастеру.",
          "",
          "Если вы мастер, проверьте, что ваш Telegram ID добавлен в MASTER_TELEGRAM_IDS на сервере.",
        ].join("\n"),
      );
      response.json({ ok: true });
      return;
    }

    await sendTelegramMessage(
      String(chatId),
      ["Админ-панель готова.", "", "Нажмите кнопку ниже, чтобы открыть управление заявками, окошками и клиентками."].join("\n"),
      buildLaunchReplyMarkup("admin"),
    );
    response.json({ ok: true });
    return;
  }

  if (command === "start" || command === "help") {
    await sendTelegramMessage(
      String(chatId),
      [
        "Это бот vvrnailss.",
        "",
        "Что можно сделать:",
        "• открыть запись на ногти;",
        isMaster ? "• открыть админ-панель командой /admin." : "• посмотреть статус заявки в мини-приложении.",
        "",
        isMaster ? "Вы вошли как мастер." : "Для записи нажмите кнопку ниже.",
      ].join("\n"),
      buildLaunchReplyMarkup(),
    );
    response.json({ ok: true });
    return;
  }

  await sendTelegramMessage(
    String(chatId),
    [
      "Я не обрабатываю свободный текст в чате.",
      "",
      "Для записи откройте мини-приложение кнопкой ниже.",
      isMaster ? "Для админ-панели используйте команду /admin." : "Если нужно связаться с мастером, укажите Telegram в заявке.",
    ].join("\n"),
    buildLaunchReplyMarkup(),
  );
  response.json({ ok: true });
  return;
});
