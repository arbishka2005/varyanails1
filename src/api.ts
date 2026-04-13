import type {
  AppSnapshot,
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  PublicBookingRequest,
  RequestStatus,
  ServiceKind,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000";
const DEV_TELEGRAM_ID = import.meta.env.VITE_DEV_TELEGRAM_ID;

function getTelegramInitData() {
  const telegram = window.Telegram?.WebApp;
  return telegram?.initData ?? "";
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getTelegramInitData() ? { "x-telegram-init-data": getTelegramInitData() } : {}),
      ...(DEV_TELEGRAM_ID ? { "x-dev-telegram-id": DEV_TELEGRAM_ID } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || `API request failed: ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function resolveApiUrl(url?: string) {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}

export const api = {
  getSnapshot: () => request<AppSnapshot>("/api/snapshot"),

  getPublicBookingConfig: () =>
    request<Pick<AppSnapshot, "services" | "windows" | "serviceOptions">>("/api/public/booking-config"),

  getPublicBookingRequest: (id: string) =>
    request<PublicBookingRequest>(`/api/public/booking-requests/${id}`),

  getPublicAppointment: (id: string) =>
    request<Appointment>(`/api/public/appointments/${id}`),

  createBookingRequest: (payload: {
    client: Client;
    photos: PhotoAttachment[];
    request: BookingRequest;
  }) =>
    request<{ ok: true }>("/api/booking-requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateRequestStatus: (id: string, status: RequestStatus) =>
    request<BookingRequest>(`/api/booking-requests/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  updateRequestWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) =>
    request<BookingRequest>(`/api/booking-requests/${id}/window`, {
      method: "PATCH",
      body: JSON.stringify({ preferredWindowId, customWindowText }),
    }),

  confirmBookingRequest: (id: string) =>
    request(`/api/booking-requests/${id}/confirm`, {
      method: "POST",
    }),

  confirmPublicBookingRequest: (id: string) =>
    request(`/api/public/booking-requests/${id}/confirm`, {
      method: "POST",
    }),

  updateClientNotes: (id: string, notes: string) =>
    request<Client>(`/api/clients/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),

  createServiceOption: (option: ServiceOption) =>
    request<ServiceOption>("/api/service-options", {
      method: "POST",
      body: JSON.stringify(option),
    }),

  updateServiceOption: (id: string, patch: Partial<ServiceOption>) =>
    request<ServiceOption>(`/api/service-options/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteServiceOption: (id: string) =>
    request<void>(`/api/service-options/${id}`, {
      method: "DELETE",
    }),

  updateService: (id: ServiceKind, patch: Partial<ServicePreset>) =>
    request<ServicePreset>(`/api/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  createService: (service: ServicePreset) =>
    request<ServicePreset>("/api/services", {
      method: "POST",
      body: JSON.stringify(service),
    }),

  deleteService: (id: ServiceKind) =>
    request<void>(`/api/services/${id}`, {
      method: "DELETE",
    }),

  createTimeWindow: (window: TimeWindow) =>
    request<TimeWindow>("/api/time-windows", {
      method: "POST",
      body: JSON.stringify(window),
    }),

  updateTimeWindowStatus: (id: string, status: TimeWindowStatus) =>
    request<TimeWindow>(`/api/time-windows/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  moveAppointment: (id: string, windowId: string) =>
    request<AppSnapshot["appointments"][number]>(`/api/appointments/${id}/window`, {
      method: "PATCH",
      body: JSON.stringify({ windowId }),
    }),

  updateAppointmentStatus: (id: string, status: Appointment["status"]) =>
    request<Appointment>(`/api/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  submitAppointmentSurvey: (id: string, payload: { rating: number; text?: string }) =>
    request<Appointment>(`/api/public/appointments/${id}/survey`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadPhoto: (payload: { kind: PhotoAttachment["kind"]; fileName: string; dataUrl: string }) =>
    request<PhotoAttachment>("/api/photos", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
