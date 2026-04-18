import type { Appointment, BookingRequest, Client, TimeWindow } from "../../src/types.js";
import { formatTimeRange } from "../../src/lib/displayTime.js";
import { notifyClient, notifyMasters } from "../notifications/telegram.js";
import { repository } from "../repositories/index.js";

function buildWindowLine(window: TimeWindow | null) {
  return window ? `Окно: ${window.label}` : "Окно: нужно согласовать";
}

async function getClientAndWindow(clientId: string, windowId: string) {
  const [client, window] = await Promise.all([
    repository.getClient(clientId),
    repository.getTimeWindow(windowId),
  ]);
  return { client, window };
}

export async function notifyBookingRequestCreated(options: {
  request: BookingRequest;
  client: Client;
}) {
  const window = options.request.preferredWindowId
    ? await repository.getTimeWindow(options.request.preferredWindowId)
    : null;

  await notifyMasters({
    title: "Новая заявка",
    lines: [
      `Заявка: ${options.request.id}`,
      `Клиент: ${options.client.name}`,
      `Телефон: ${options.client.phone}`,
      `Услуга: ${options.request.service}`,
      buildWindowLine(window),
    ],
  });
}

export async function notifyRequestStatusChanged(request: BookingRequest) {
  const client = await repository.getClient(request.clientId);

  if (request.status === "needs_clarification") {
    await notifyClient(client, {
      title: "Нужно уточнить запись",
      lines: [
        "Мастеру нужно чуть больше деталей по заявке.",
        "Напишите, пожалуйста, чтобы спокойно подобрать время и формат.",
      ],
    });
    return;
  }

  if (request.status === "declined") {
    await notifyClient(client, {
      title: "Заявка закрыта",
      lines: [
        "Сейчас не получится взять эту запись.",
        "Если хотите подобрать другое время, напишите мастеру.",
      ],
    });
  }
}

export async function notifyBookingConfirmed(
  appointment: Appointment,
  confirmedBy: "master" | "client",
) {
  const client = await repository.getClient(appointment.clientId);
  const timeLabel = formatTimeRange(appointment.startAt, appointment.endAt);

  if (confirmedBy === "client") {
    await notifyMasters({
      title: "Клиент подтвердил запись",
      lines: [
        `Заявка: ${appointment.requestId}`,
        client ? `Клиент: ${client.name}` : "",
        `Время: ${timeLabel}`,
      ],
    });
    return;
  }

  await notifyClient(client, {
    title: "Запись подтверждена",
    lines: [
      `Время: ${timeLabel}`,
      "Если планы изменятся, напишите мастеру заранее.",
    ],
  });
}

export async function notifyAppointmentCancelled(appointment: Appointment) {
  const client = await repository.getClient(appointment.clientId);

  await notifyClient(client, {
    title: "Запись отменена",
    lines: [
      "Запись была отменена.",
      "Если нужно подобрать другое время, напишите мастеру.",
    ],
  });
}

export async function notifyAppointmentMoved(appointment: Appointment, windowId: string) {
  const { client, window } = await getClientAndWindow(appointment.clientId, windowId);

  await notifyMasters({
    title: "Запись перенесена",
    lines: [
      `Запись: ${appointment.id}`,
      client ? `Клиент: ${client.name}` : "",
      window ? `Новое окно: ${window.label}` : "",
    ],
  });

  if (!window) {
    return;
  }

  await notifyClient(client, {
    title: "Запись перенесена",
    lines: [
      "Мы перенесли вашу запись.",
      `Новое время: ${window.label}`,
      "Если время не подходит, напишите мастеру.",
    ],
  });
}
