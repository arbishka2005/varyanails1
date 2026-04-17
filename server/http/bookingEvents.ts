import type { Appointment, BookingRequest, Client, TimeWindow } from "../../src/types.js";
import { notifyClient, notifyMasters } from "../notifications/telegram.js";
import { repository } from "../repositories/index.js";

function buildWindowLine(window: TimeWindow | null) {
  return window ? `Окно: ${window.label}` : "Окно: нужно согласовать";
}

async function getClientName(clientId: string) {
  const client = await repository.getClient(clientId);
  return client?.name;
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
  const clientName = await getClientName(request.clientId);

  await notifyMasters({
    title: "Статус заявки изменен",
    lines: [
      `Заявка: ${request.id}`,
      `Статус: ${request.status}`,
      clientName ? `Клиент: ${clientName}` : "",
    ],
  });
}

export async function notifyRequestWindowChanged(request: BookingRequest) {
  const [clientName, window] = await Promise.all([
    getClientName(request.clientId),
    request.preferredWindowId ? repository.getTimeWindow(request.preferredWindowId) : Promise.resolve(null),
  ]);

  await notifyMasters({
    title: "Предложено другое окно",
    lines: [
      `Заявка: ${request.id}`,
      clientName ? `Клиент: ${clientName}` : "",
      buildWindowLine(window),
    ],
  });
}

export async function notifyBookingConfirmed(
  appointment: Appointment,
  confirmedBy: "master" | "client",
) {
  const clientName = await getClientName(appointment.clientId);

  await notifyMasters({
    title: confirmedBy === "master" ? "Заявка подтверждена мастером" : "Клиент подтвердил окно",
    lines: [
      `Заявка: ${appointment.requestId}`,
      clientName ? `Клиент: ${clientName}` : "",
      `Время: ${appointment.startAt}`,
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
