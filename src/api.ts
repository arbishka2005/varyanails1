import type {
  AppSnapshot,
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  PublicBookingAccess,
  PublicBookingConfig,
  PublicBookingRequest,
  RequestStatus,
  ServiceKind,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";
const DEV_TELEGRAM_ID = import.meta.env.VITE_DEV_TELEGRAM_ID;

type ApiErrorKind = "network" | "http" | "invalid_json";

type ApiErrorBody = {
  error?: string;
  issues?: unknown;
  [key: string]: unknown;
};

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function getTelegramInitData() {
  const telegram = window.Telegram?.WebApp;
  return telegram?.initData ?? "";
}

function buildHeaders(initHeaders?: HeadersInit, hasBody = false) {
  const headers = new Headers(initHeaders);
  headers.set("Accept", "application/json");

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const telegramInitData = getTelegramInitData();
  if (telegramInitData) {
    headers.set("x-telegram-init-data", telegramInitData);
  }

  if (DEV_TELEGRAM_ID) {
    headers.set("x-dev-telegram-id", DEV_TELEGRAM_ID);
  }

  return headers;
}

function getFallbackHttpMessage(status: number) {
  if (status === 401 || status === 403) {
    return "Нет доступа. Откройте приложение через Telegram.";
  }

  if (status === 404) {
    return "Данные не найдены или уже изменились.";
  }

  if (status === 409) {
    return "Действие конфликтует с текущим состоянием. Обновите данные и попробуйте ещё раз.";
  }

  if (status >= 500) {
    return "Сервер временно не отвечает. Попробуйте позже.";
  }

  return `API вернул ошибку ${status}`;
}

export class ApiError extends Error {
  status: number;
  kind: ApiErrorKind;
  details?: unknown;
  rawBody?: string;

  constructor(message: string, options: { status: number; kind: ApiErrorKind; details?: unknown; rawBody?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.kind = options.kind;
    this.details = options.details;
    this.rawBody = options.rawBody;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

async function readResponseBody(response: Response) {
  if (response.status === 204) {
    return undefined;
  }

  const rawBody = await response.text();
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    if (!response.ok) {
      return rawBody;
    }

    throw new ApiError("Сервер вернул повреждённый ответ. Попробуйте обновить страницу.", {
      status: response.status,
      kind: "invalid_json",
      rawBody,
    });
  }
}

function getErrorMessage(body: unknown, status: number) {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }

  if (body && typeof body === "object") {
    const errorBody = body as ApiErrorBody;
    if (typeof errorBody.error === "string" && errorBody.error.trim()) {
      return errorBody.error.trim();
    }
  }

  return getFallbackHttpMessage(status);
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, ...init } = options;
  const hasBody = body !== undefined;
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: buildHeaders(headers, hasBody),
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new ApiError("Не удалось подключиться к серверу. Проверьте интернет и попробуйте ещё раз.", {
      status: 0,
      kind: "network",
      details: error,
    });
  }

  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    throw new ApiError(getErrorMessage(responseBody, response.status), {
      status: response.status,
      kind: "http",
      details: typeof responseBody === "object" ? responseBody : undefined,
      rawBody: typeof responseBody === "string" ? responseBody : undefined,
    });
  }

  return responseBody as T;
}

export function getApiErrorMessage(error: unknown, fallback = "Не удалось выполнить действие") {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function isApiAuthError(error: unknown) {
  return error instanceof ApiError && error.isAuthError;
}

export function resolveApiUrl(url?: string) {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return API_BASE_URL ? `${API_BASE_URL}${url}` : url;
  }
  return url;
}

export const api = {
  getSnapshot: () => request<AppSnapshot>("/api/snapshot"),

  getPublicBookingConfig: () => request<PublicBookingConfig>("/api/public/booking-config"),

  getPublicBookingRequest: (id: string) =>
    request<PublicBookingRequest>(`/api/public/booking-requests/${id}`),

  getPublicAppointment: (id: string) =>
    request<Appointment>(`/api/public/appointments/${id}`),

  createBookingRequest: (payload: {
    client: Client;
    photos: PhotoAttachment[];
    request: BookingRequest;
  }) =>
    request<{ ok: true } & PublicBookingAccess>("/api/booking-requests", {
      method: "POST",
      body: payload,
    }),

  updateRequestStatus: (id: string, status: RequestStatus) =>
    request<BookingRequest>(`/api/booking-requests/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  updateRequestWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) =>
    request<BookingRequest>(`/api/booking-requests/${id}/window`, {
      method: "PATCH",
      body: { preferredWindowId, customWindowText },
    }),

  confirmBookingRequest: (id: string) =>
    request<Appointment>(`/api/booking-requests/${id}/confirm`, {
      method: "POST",
    }),

  confirmPublicBookingRequest: (id: string) =>
    request<Appointment>(`/api/public/booking-requests/${id}/confirm`, {
      method: "POST",
    }),

  updateClientNotes: (id: string, notes: string) =>
    request<Client>(`/api/clients/${id}/notes`, {
      method: "PATCH",
      body: { notes },
    }),

  deleteClient: (id: string) =>
    request<void>(`/api/clients/${id}`, {
      method: "DELETE",
    }),

  createServiceOption: (option: ServiceOption) =>
    request<ServiceOption>("/api/service-options", {
      method: "POST",
      body: option,
    }),

  updateServiceOption: (id: string, patch: Partial<ServiceOption>) =>
    request<ServiceOption>(`/api/service-options/${id}`, {
      method: "PATCH",
      body: patch,
    }),

  deleteServiceOption: (id: string) =>
    request<void>(`/api/service-options/${id}`, {
      method: "DELETE",
    }),

  updateService: (id: ServiceKind, patch: Omit<Partial<ServicePreset>, "priceFrom"> & { priceFrom?: number | null }) =>
    request<ServicePreset>(`/api/services/${id}`, {
      method: "PATCH",
      body: patch,
    }),

  createService: (service: ServicePreset) =>
    request<ServicePreset>("/api/services", {
      method: "POST",
      body: service,
    }),

  deleteService: (id: ServiceKind) =>
    request<void>(`/api/services/${id}`, {
      method: "DELETE",
    }),

  createTimeWindow: (window: TimeWindow) =>
    request<TimeWindow>("/api/time-windows", {
      method: "POST",
      body: window,
    }),

  updateTimeWindowStatus: (id: string, status: TimeWindowStatus) =>
    request<TimeWindow>(`/api/time-windows/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  deleteTimeWindow: (id: string) =>
    request<void>(`/api/time-windows/${id}`, {
      method: "DELETE",
    }),

  moveAppointment: (id: string, windowId: string) =>
    request<AppSnapshot["appointments"][number]>(`/api/appointments/${id}/window`, {
      method: "PATCH",
      body: { windowId },
    }),

  updateAppointmentStatus: (id: string, status: Appointment["status"]) =>
    request<Appointment>(`/api/appointments/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  deleteAppointment: (id: string) =>
    request<void>(`/api/appointments/${id}`, {
      method: "DELETE",
    }),

  submitAppointmentSurvey: (id: string, payload: { rating: number; text?: string }) =>
    request<Appointment>(`/api/public/appointments/${id}/survey`, {
      method: "POST",
      body: payload,
    }),

  uploadPhoto: (payload: { kind: PhotoAttachment["kind"]; fileName: string; dataUrl: string }) =>
    request<PhotoAttachment>("/api/photos", {
      method: "POST",
      body: payload,
    }),
};
