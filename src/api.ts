import type {
  AppSnapshot,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
  ServiceKind,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000";
const DEV_TELEGRAM_ID = import.meta.env.VITE_DEV_TELEGRAM_ID;

function getTelegramInitData() {
  const telegram = window.Telegram?.WebApp;
  return telegram?.initData ?? "";
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
    throw new Error(message || `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getSnapshot: () => request<AppSnapshot>("/api/snapshot"),

  getPublicBookingConfig: () =>
    request<Pick<AppSnapshot, "services" | "windows">>("/api/public/booking-config"),

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

  updateClientNotes: (id: string, notes: string) =>
    request<Client>(`/api/clients/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),

  updateService: (id: ServiceKind, patch: Partial<ServicePreset>) =>
    request<ServicePreset>(`/api/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
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
};
