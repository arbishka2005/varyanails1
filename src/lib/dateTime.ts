import type { TimeWindow } from "../types";

export const APP_TIME_ZONE = "Europe/Moscow";
export const APP_TIME_ZONE_OFFSET = "+03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

function getDateParts(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: APP_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return {
    day: part("day"),
    month: part("month"),
    year: part("year"),
  };
}

export function getLocalDateKey(value: string | Date) {
  const parts = getDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTodayDateKey(now = new Date()) {
  return getLocalDateKey(now);
}

export function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shiftedDate = new Date(Date.UTC(year, month - 1, day + days, 12));
  const shiftedYear = shiftedDate.getUTCFullYear();
  const shiftedMonth = String(shiftedDate.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shiftedDate.getUTCDate()).padStart(2, "0");

  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

export function getRelativeDateKey(days: number, from = new Date()) {
  return shiftDateKey(getLocalDateKey(from), days);
}

export function toAppDateTime(date: string, time: string) {
  return `${date}T${time}:00${APP_TIME_ZONE_OFFSET}`;
}

export function getTimestamp(value: string | Date) {
  return (typeof value === "string" ? new Date(value) : value).getTime();
}

export function isFutureDateTime(value: string | Date, now = Date.now()) {
  return getTimestamp(value) >= now;
}

export function isPastDateTime(value: string | Date, now = Date.now()) {
  return getTimestamp(value) < now;
}

export function compareDateTimeAsc(left: string | Date, right: string | Date) {
  return getTimestamp(left) - getTimestamp(right);
}

export function compareDateTimeDesc(left: string | Date, right: string | Date) {
  return getTimestamp(right) - getTimestamp(left);
}

export function isWithinNextDays(value: string | Date, days: number, now = Date.now()) {
  const time = getTimestamp(value);
  return time >= now && time <= now + days * DAY_MS;
}

export function isOlderThan(value: string | Date, ms: number, now = Date.now()) {
  return now - getTimestamp(value) > ms;
}

export function getNextWeekendDateKey(from = new Date()) {
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(from);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayShort] ?? 0;
  const daysUntilSaturday = (6 - weekday + 7) % 7 || 7;

  return getRelativeDateKey(daysUntilSaturday, from);
}

export function isValidDateRange(startAt: string, endAt: string) {
  const start = getTimestamp(startAt);
  const end = getTimestamp(endAt);

  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export function isSameWindowRange(left: Pick<TimeWindow, "startAt" | "endAt">, right: Pick<TimeWindow, "startAt" | "endAt">) {
  return getTimestamp(left.startAt) === getTimestamp(right.startAt) &&
    getTimestamp(left.endAt) === getTimestamp(right.endAt);
}

export function doWindowRangesOverlap(
  left: Pick<TimeWindow, "startAt" | "endAt">,
  right: Pick<TimeWindow, "startAt" | "endAt">,
) {
  const leftStart = getTimestamp(left.startAt);
  const leftEnd = getTimestamp(left.endAt);
  const rightStart = getTimestamp(right.startAt);
  const rightEnd = getTimestamp(right.endAt);

  return leftStart < rightEnd && rightStart < leftEnd;
}

export function getWindowConflict(
  candidate: Pick<TimeWindow, "startAt" | "endAt">,
  windows: Pick<TimeWindow, "id" | "startAt" | "endAt">[],
  ignoredWindowId?: string,
) {
  if (!isValidDateRange(candidate.startAt, candidate.endAt)) {
    return "Окошко должно заканчиваться позже, чем начинается.";
  }

  const existingWindows = windows.filter((window) => window.id !== ignoredWindowId);

  if (existingWindows.some((window) => isSameWindowRange(candidate, window))) {
    return "Такое окошко уже есть.";
  }

  if (existingWindows.some((window) => doWindowRangesOverlap(candidate, window))) {
    return "Окошко пересекается с уже созданным.";
  }

  return "";
}
