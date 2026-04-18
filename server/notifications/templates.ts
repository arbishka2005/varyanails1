export type NotificationPayload = {
  title: string;
  lines: string[];
  accent?: string;
  replyMarkup?: Record<string, unknown>;
};

export function buildReminder24hPayload(timeLabel: string, clientName?: string): NotificationPayload {
  return {
    title: "Завтра у вас запись",
    accent: "\uD83D\uDC85",
    lines: [
      "Напоминаю о вашей записи на ногти.",
      `Когда: ${timeLabel}`,
      clientName ? `Имя в записи: ${clientName}` : "",
      "Если планы изменились, напишите мастеру заранее, чтобы спокойно подобрать другое время.",
    ],
  };
}

export function buildReminder3hPayload(timeLabel: string): NotificationPayload {
  return {
    title: "Скоро встречаемся",
    accent: "\uD83D\uDCC5",
    lines: [
      "До записи осталось около 3 часов.",
      `Когда: ${timeLabel}`,
      "Если вы уже в пути или хотите что-то уточнить по дизайну, можно написать мастеру в Telegram.",
    ],
  };
}

export function buildSurveyPayload(surveyUrl: string): NotificationPayload {
  return {
    title: "Как прошёл визит?",
    accent: "\u2728",
    lines: [
      "Спасибо, что пришли. Мне очень важна ваша обратная связь.",
      "Оцените визит и, если захочется, оставьте пару слов о впечатлении.",
    ],
    replyMarkup: {
      inline_keyboard: [[{ text: "Оставить отзыв", url: surveyUrl }]],
    },
  };
}
