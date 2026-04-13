import type { Appointment, Client } from "../../src/types.js";
import type { Repository } from "../repositories/types.js";

const HOUR_MS = 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 60 * 60 * 1000;

type NotifyClient = (client: Client | null | undefined, payload: { title: string; lines: string[] }) => Promise<void>;

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startAt));
  const end = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(endAt));
  return `${start} – ${end}`;
}

function isWithinWindow(diffMs: number, targetHours: number) {
  const upper = targetHours * HOUR_MS;
  const lower = upper - REMINDER_WINDOW_MS;
  return diffMs <= upper && diffMs > lower;
}

export function startAppointmentScheduler(options: {
  repository: Repository;
  notifyClient: NotifyClient;
  appBaseUrl: string;
}) {
  const { repository, notifyClient, appBaseUrl } = options;
  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }
    running = true;

    try {
      const snapshot = await repository.getSnapshot();
      const now = Date.now();
      const clientsById = new Map(snapshot.clients.map((client) => [client.id, client]));

      for (const appointment of snapshot.appointments) {
        if (appointment.status !== "scheduled") {
          continue;
        }

        const startAt = new Date(appointment.startAt).getTime();
        const endAt = new Date(appointment.endAt).getTime();
        const diffMs = startAt - now;
        const client = clientsById.get(appointment.clientId);
        const timeLabel = formatTimeRange(appointment.startAt, appointment.endAt);

        if (!appointment.reminder24hSentAt && isWithinWindow(diffMs, 24)) {
          if (client?.telegramUserId) {
            await notifyClient(client, {
              title: "Напоминание за 24 часа",
              lines: [
                `Ваша запись через 24 часа.`,
                `Время: ${timeLabel}`,
                "Если нужно перенести, напишите мастеру в Telegram.",
              ],
            });
            await repository.markAppointmentReminder(appointment.id, "24h", new Date().toISOString());
          }
        }

        if (!appointment.reminder3hSentAt && isWithinWindow(diffMs, 3)) {
          if (client?.telegramUserId) {
            await notifyClient(client, {
              title: "Напоминание за 3 часа",
              lines: [
                `Ваша запись через 3 часа.`,
                `Время: ${timeLabel}`,
                "Если нужно перенести, напишите мастеру в Telegram.",
              ],
            });
            await repository.markAppointmentReminder(appointment.id, "3h", new Date().toISOString());
          }
        }

        if (!appointment.surveySentAt && !appointment.surveyRating && endAt < now - HOUR_MS) {
          if (client?.telegramUserId) {
            const surveyUrl = `${appBaseUrl.replace(/\/$/, "")}/#/survey?appointment=${appointment.id}`;
            await notifyClient(client, {
              title: "Оцените визит",
              lines: [
                "Спасибо, что пришли!",
                "Оцените визит и оставьте короткий отзыв:",
                surveyUrl,
              ],
            });
            await repository.markAppointmentSurveySent(appointment.id, new Date().toISOString());
          }
        }
      }
    } catch (error) {
      console.error("Scheduler error:", error);
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(() => void tick(), 60 * 1000);
}
