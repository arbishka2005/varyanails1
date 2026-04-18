import type {
  AppointmentStatus,
  BookingRequest,
  ContactChannel,
  NailLength,
  PhotoAttachment,
  RequestStatus,
  ServiceKind,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../types";
import { APP_TIME_ZONE, compareDateTimeDesc, getLocalDateKey } from "./dateTime";

export const contactLabels: Record<ContactChannel, string> = {
  telegram: "Telegram",
  vk: "VK",
  phone: "Телефон",
};

export const lengthLabels: Record<NailLength, string> = {
  short: "Короткая",
  medium: "Средняя",
  long: "Длинная",
  extra: "Очень длинная",
};

export const statusLabels: Record<RequestStatus, string> = {
  new: "Новая заявка",
  needs_clarification: "Нужны уточнения",
  waiting_client: "Ждёт подтверждения",
  confirmed: "Подтверждена",
  declined: "Отклонена",
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Запланирована",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не пришёл",
};

export function getServiceTitle(services: ServicePreset[], id: ServiceKind) {
  return services.find((service) => service.id === id)?.title ?? id;
}

export function photoKindLabel(kind: PhotoAttachment["kind"]) {
  return kind === "hands" ? "Фото рук" : "Референс";
}

export function formatDayLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

export function formatTimeRange(startAt: string, endAt: string) {
  const start = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(startAt));
  const end = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(endAt));

  return `${start}-${end}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

export function makeWindowLabel(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: APP_TIME_ZONE,
  }).format(start);
  const startTime = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(start);
  const endTime = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(end);

  return `${date}, ${startTime}-${endTime}`;
}

export function windowStatusLabel(status: TimeWindowStatus) {
  const labels: Record<TimeWindowStatus, string> = {
    available: "Свободно",
    offered: "Предложено",
    reserved: "Занято",
    blocked: "Закрыто",
  };

  return labels[status];
}

export function groupWindowsByDate(windows: TimeWindow[]) {
  const map = new Map<string, { dateKey: string; label: string; items: TimeWindow[] }>();

  windows.forEach((window) => {
    const dateKey = getLocalDateKey(window.startAt);
    const current = map.get(dateKey) ?? {
      dateKey,
      label: formatDayLabel(window.startAt),
      items: [],
    };
    current.items.push(window);
    map.set(dateKey, current);
  });

  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function buildRequestPriority(requests: BookingRequest[]) {
  const requestPriority: Record<RequestStatus, number> = {
    new: 0,
    needs_clarification: 1,
    waiting_client: 2,
    confirmed: 3,
    declined: 4,
  };

  return [...requests]
    .sort(
      (left, right) =>
        requestPriority[left.status] - requestPriority[right.status] ||
        compareDateTimeDesc(left.createdAt, right.createdAt),
    )
    .filter((request) => request.status !== "confirmed" && request.status !== "declined");
}
