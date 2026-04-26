import type {
  AppointmentStatus,
  ContactChannel,
  NailLength,
  PhotoAttachment,
  RequestStatus,
  ServiceKind,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../types";
import {
  formatDateTime,
  formatDayLabel,
  formatTimeRange,
  groupItemsByDisplayDate,
  makeWindowLabel,
} from "./displayTime";

export {
  formatDateTime,
  formatDayLabel,
  formatTimeRange,
  makeWindowLabel,
};

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
  new: "Вы отправили заявку",
  needs_clarification: "Нужно уточнить",
  waiting_client: "Подтвердите время",
  confirmed: "Вы записаны",
  declined: "Не получилось записать",
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Запланирована",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не пришёл",
};

export function getServiceTitle(services: ServicePreset[], id: ServiceKind) {
  return services.find((service) => service.id === id)?.title ?? "Услуга";
}

export function photoKindLabel(kind: PhotoAttachment["kind"]) {
  return kind === "hands" ? "Фото рук" : "Референс";
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
  return groupItemsByDisplayDate(windows);
}
