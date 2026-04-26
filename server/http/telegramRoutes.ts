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
          "Похоже, у этого Telegram нет доступа мастера.",
          "",
          "Если это ваш аккаунт, проверьте Telegram ID в настройках сервера.",
        ].join("\n"),
      );
      response.json({ ok: true });
      return;
    }

    await sendTelegramMessage(
      String(chatId),
      ["Кабинет мастера открыт.", "", "Нажмите кнопку ниже, чтобы посмотреть записи, окошки и клиенток."].join("\n"),
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
        isMaster ? "• открыть кабинет мастера командой /admin." : "• посмотреть свою запись в мини-приложении.",
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
      isMaster ? "Для кабинета мастера используйте команду /admin." : "Если нужно связаться с мастером, укажите Telegram при записи.",
    ].join("\n"),
    buildLaunchReplyMarkup(),
  );
  response.json({ ok: true });
  return;
});
