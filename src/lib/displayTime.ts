import type { TimeWindow } from "../types";
import { APP_TIME_ZONE, getLocalDateKey, getTimestamp } from "./dateTime";

const MISSING_DATE_LABEL = "Дата не указана";
const MISSING_TIME_LABEL = "Время не указано";

function toValidDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions, fallback: string) {
  const date = toValidDate(value);

  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    ...options,
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

export function getDisplayDateKey(value: string | Date) {
  return Number.isFinite(getTimestamp(value)) ? getLocalDateKey(value) : "unknown";
}

export function formatDayLabel(value: string | Date) {
  return formatDate(value, {
    day: "numeric",
    month: "long",
  }, MISSING_DATE_LABEL);
}

export function formatTimeLabel(value: string | Date) {
  return formatDate(value, {
    hour: "2-digit",
    minute: "2-digit",
  }, MISSING_TIME_LABEL);
}

export function formatTimeRange(startAt: string | Date, endAt: string | Date) {
  const start = formatTimeLabel(startAt);
  const end = formatTimeLabel(endAt);

  if (start === MISSING_TIME_LABEL || end === MISSING_TIME_LABEL) {
    return MISSING_TIME_LABEL;
  }

  return `${start}-${end}`;
}

export function formatDateTime(value: string | Date) {
  return formatDate(value, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
  }, MISSING_DATE_LABEL);
}

export function formatDateTimeRange(startAt: string | Date, endAt: string | Date) {
  const start = formatDate(startAt, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
  }, MISSING_DATE_LABEL);
  const end = formatTimeLabel(endAt);

  if (start === MISSING_DATE_LABEL || end === MISSING_TIME_LABEL) {
    return MISSING_TIME_LABEL;
  }

  return `${start} - ${end}`;
}

export function makeWindowLabel(startAt: string | Date, endAt: string | Date) {
  const day = formatDayLabel(startAt);
  const time = formatTimeRange(startAt, endAt);

  if (day === MISSING_DATE_LABEL || time === MISSING_TIME_LABEL) {
    return MISSING_TIME_LABEL;
  }

  return `${day}, ${time}`;
}

export type WindowDateGroup<T extends Pick<TimeWindow, "startAt">> = {
  dateKey: string;
  label: string;
  items: T[];
};

export function groupItemsByDisplayDate<T extends Pick<TimeWindow, "startAt">>(items: T[]) {
  const map = new Map<string, WindowDateGroup<T>>();

  items.forEach((item) => {
    const dateKey = getDisplayDateKey(item.startAt);
    const current = map.get(dateKey) ?? {
      dateKey,
      label: dateKey === "unknown" ? MISSING_DATE_LABEL : formatDayLabel(item.startAt),
      items: [],
    };
    current.items.push(item);
    map.set(dateKey, current);
  });

  return Array.from(map.values()).sort((left, right) => {
    if (left.dateKey === "unknown") {
      return 1;
    }

    if (right.dateKey === "unknown") {
      return -1;
    }

    return left.dateKey.localeCompare(right.dateKey);
  });
}
