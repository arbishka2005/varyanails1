import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  Appointment,
  BookingRequest,
  Client,
  PublicBookingAccess,
  RequestStatus,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../src/types.js";
import { seedClients, seedPhotos, seedRequests, serviceOptions, servicePresets, timeWindows } from "../../src/data.js";
import { makeWindowLabel } from "../../src/lib/bookingPresentation.js";
import { getWindowConflict, isFutureDateTime } from "../../src/lib/dateTime.js";
import { config } from "../config.js";
import { DomainError } from "../lib/domainErrors.js";
import type { AppSnapshot, PublicBookingConfig, Repository } from "./types.js";
import { generatePublicToken } from "../lib/publicTokens.js";

const emptySnapshot: AppSnapshot = {
  clients: [],
  photos: [],
  requests: [],
  appointments: [],
  windows: [],
  services: [],
  serviceOptions: [],
};

function ensureRequestPublicToken(request: BookingRequest): BookingRequest {
  return request.publicToken ? request : { ...request, publicToken: generatePublicToken() };
}

function ensureAppointmentPublicToken(appointment: Appointment): Appointment {
  return appointment.publicToken ? appointment : { ...appointment, publicToken: generatePublicToken() };
}

function normalizeSnapshot(snapshot: AppSnapshot) {
  let changed = false;

  const requests = snapshot.requests.map((request) => {
    const normalized = ensureRequestPublicToken(request);
    if (normalized !== request) {
      changed = true;
    }
    return normalized;
  });

  const appointments = snapshot.appointments.map((appointment) => {
    const normalized = ensureAppointmentPublicToken(appointment);
    if (normalized !== appointment) {
      changed = true;
    }
    return normalized;
  });

  const windows = snapshot.windows.map((window) => {
    const label = makeWindowLabel(window.startAt, window.endAt);
    if (window.label !== label) {
      changed = true;
      return { ...window, label };
    }

    return window;
  });

  return {
    changed,
    snapshot: {
      ...snapshot,
      requests,
      appointments,
      windows,
    },
  };
}

async function readSnapshot(): Promise<AppSnapshot> {
  try {
    const raw = await readFile(config.fileStoragePath, "utf8");
    const parsed = JSON.parse(raw) as AppSnapshot;
    const merged = { ...emptySnapshot, ...parsed };
    const normalized = normalizeSnapshot(merged);

    if (normalized.changed) {
      await writeSnapshot(normalized.snapshot);
    }

    return normalized.snapshot;
  } catch {
    return { ...emptySnapshot };
  }
}

async function writeSnapshot(snapshot: AppSnapshot) {
  await mkdir(dirname(config.fileStoragePath), { recursive: true });
  await writeFile(config.fileStoragePath, JSON.stringify(snapshot, null, 2), "utf8");
}

let mutationQueue = Promise.resolve();

async function mutateSnapshot<T>(callback: (snapshot: AppSnapshot) => T | Promise<T>) {
  const run = mutationQueue.then(async () => {
    const snapshot = await readSnapshot();
    const result = await callback(snapshot);
    await writeSnapshot(snapshot);
    return result;
  });

  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function markWindowOffered(snapshot: AppSnapshot, windowId: string | null) {
  if (!windowId) {
    return;
  }
  snapshot.windows = snapshot.windows.map((window) =>
    window.id === windowId && window.status === "available" ? { ...window, status: "offered" } : window,
  );
}

function releaseWindowIfUnused(snapshot: AppSnapshot, windowId: string | null) {
  if (!windowId) {
    return;
  }
  const stillUsed = snapshot.requests.some(
    (request) => request.preferredWindowId === windowId && request.status !== "declined",
  );
  if (!stillUsed) {
    snapshot.windows = snapshot.windows.map((window) =>
      window.id === windowId && window.status === "offered" ? { ...window, status: "available" } : window,
    );
  }
}

function getWindowStatusError(snapshot: AppSnapshot, window: TimeWindow, nextStatus: TimeWindowStatus) {
  if (window.status === nextStatus) {
    return "";
  }

  const isManualTransition =
    (window.status === "available" && nextStatus === "blocked") ||
    (window.status === "blocked" && nextStatus === "available");

  if (!isManualTransition) {
    return "Этот статус меняется только через заявку или запись.";
  }

  const hasActiveRequest = snapshot.requests.some(
    (request) => request.preferredWindowId === window.id && request.status !== "declined",
  );

  if (hasActiveRequest) {
    return "Окошко уже привязано к заявке.";
  }

  const hasScheduledAppointment = snapshot.appointments.some(
    (appointment) =>
      appointment.status === "scheduled" &&
      appointment.startAt === window.startAt &&
      appointment.endAt === window.endAt,
  );

  if (hasScheduledAppointment) {
    return "Окошко уже занято записью.";
  }

  return "";
}

function assertWindowIsNotOwnedByAnotherActiveRequest(
  snapshot: AppSnapshot,
  windowId: string,
  requestId: string,
) {
  const owner = snapshot.requests.find(
    (request) =>
      request.preferredWindowId === windowId &&
      request.id !== requestId &&
      request.status !== "declined",
  );

  if (owner) {
    throw new DomainError("Это окошко уже привязано к другой заявке.");
  }
}

function getRequestStatusTransitionError(request: BookingRequest, nextStatus: RequestStatus) {
  if (request.status === nextStatus) {
    return "";
  }

  if (nextStatus === "confirmed") {
    return "Подтверждение заявки проходит через создание записи.";
  }

  if (nextStatus === "waiting_client") {
    return "waiting_client оставлен только для старых заявок.";
  }

  if (request.status === "confirmed") {
    return "Подтверждённую заявку меняйте через запись в расписании.";
  }

  if (request.status === "declined") {
    return "Отклонённая заявка закрыта.";
  }

  if (nextStatus !== "needs_clarification" && nextStatus !== "declined") {
    return "Недопустимый переход статуса заявки.";
  }

  return "";
}

export const fileRepository: Repository = {
  async bootstrapSeedData() {
    await mutateSnapshot((snapshot) => {
      if (snapshot.services.length > 0) {
        return;
      }

      snapshot.services = servicePresets;
      snapshot.windows = timeWindows;
      snapshot.clients = seedClients;
      snapshot.photos = seedPhotos;
      snapshot.requests = seedRequests;
      snapshot.appointments = [];
      snapshot.serviceOptions = serviceOptions;
    });
  },

  async getSnapshot() {
    return readSnapshot();
  },

  async getPublicBookingConfig(): Promise<PublicBookingConfig> {
    const snapshot = await readSnapshot();
    return {
      services: snapshot.services,
      windows: snapshot.windows.filter((window) => window.status === "available" && isFutureDateTime(window.startAt)),
      serviceOptions: snapshot.serviceOptions,
    };
  },

  async getBookingRequest(id: string) {
    const snapshot = await readSnapshot();
    return snapshot.requests.find((request) => request.id === id) ?? null;
  },

  async getBookingRequestByPublicToken(token: string) {
    const snapshot = await readSnapshot();
    return snapshot.requests.find((request) => request.publicToken === token) ?? null;
  },

  async getAppointment(id: string) {
    const snapshot = await readSnapshot();
    return snapshot.appointments.find((appointment) => appointment.id === id) ?? null;
  },

  async getAppointmentByPublicToken(token: string) {
    const snapshot = await readSnapshot();
    return snapshot.appointments.find((appointment) => appointment.publicToken === token) ?? null;
  },

  async getTimeWindow(id: string) {
    const snapshot = await readSnapshot();
    return snapshot.windows.find((window) => window.id === id) ?? null;
  },

  async getClient(id: string) {
    const snapshot = await readSnapshot();
    return snapshot.clients.find((client) => client.id === id) ?? null;
  },

  async createBookingRequest(payload) {
    return mutateSnapshot((snapshot): PublicBookingAccess => {
      const request = ensureRequestPublicToken(payload.request);

      if (request.status !== "new") {
        throw new DomainError("Новая заявка должна начинаться в статусе new.");
      }

      const selectedWindow = request.preferredWindowId
        ? snapshot.windows.find((window) => window.id === request.preferredWindowId)
        : null;

      if (!selectedWindow || selectedWindow.status !== "available" || !isFutureDateTime(selectedWindow.startAt)) {
        throw new DomainError("Выберите свободное окошко из списка.");
      }

      snapshot.clients = [payload.client, ...snapshot.clients.filter((client) => client.id !== payload.client.id)];
      snapshot.photos = [
        ...payload.photos,
        ...snapshot.photos.filter((photo) => !payload.photos.some((item) => item.id === photo.id)),
      ];
      snapshot.requests = [request, ...snapshot.requests];
      markWindowOffered(snapshot, request.preferredWindowId);

      return {
        requestId: request.id,
        publicToken: request.publicToken as string,
      };
    });
  },

  async updateRequestStatus(id: string, status: RequestStatus) {
    return mutateSnapshot((snapshot) => {
      let updated: BookingRequest | null = null;
      let previousWindowId: string | null = null;
      snapshot.requests = snapshot.requests.map((request) => {
        if (request.id !== id) {
          return request;
        }

        previousWindowId = request.preferredWindowId;
        updated =
          status === "declined" || status === "needs_clarification"
            ? { ...request, status, preferredWindowId: null, customWindowText: undefined }
            : { ...request, status };

        const transitionError = getRequestStatusTransitionError(request, status);

        if (transitionError) {
          throw new DomainError(transitionError);
        }

        return updated;
      });
      if (status === "declined" || status === "needs_clarification") {
        releaseWindowIfUnused(snapshot, previousWindowId);
      }
      return updated;
    });
  },

  async updateRequestWindow(id: string, preferredWindowId: string | null, customWindowText?: string) {
    return mutateSnapshot((snapshot) => {
      let updated: BookingRequest | null = null;
      let previousWindowId: string | null = null;
      const currentRequest = snapshot.requests.find((request) => request.id === id) ?? null;

      if (!currentRequest) {
        return null;
      }

      if (currentRequest.status === "confirmed") {
        throw new DomainError("Заявка уже подтверждена. Переносите запись в расписании.");
      }

      if (currentRequest.status === "declined") {
        throw new DomainError("Заявка уже отклонена.");
      }

      if (preferredWindowId) {
        const selectedWindow = snapshot.windows.find((window) => window.id === preferredWindowId) ?? null;

        if (
          !selectedWindow ||
          (selectedWindow.status !== "available" && preferredWindowId !== currentRequest.preferredWindowId)
        ) {
          throw new DomainError("Это окошко уже занято. Выберите другое.");
        }

        if (
          preferredWindowId === currentRequest.preferredWindowId &&
          (selectedWindow.status === "reserved" || selectedWindow.status === "blocked")
        ) {
          throw new DomainError("Это окошко уже недоступно.");
        }
      }

      snapshot.requests = snapshot.requests.map((request) => {
        if (request.id !== id) {
          return request;
        }

        previousWindowId = request.preferredWindowId;
        updated = {
          ...request,
          preferredWindowId,
          customWindowText: preferredWindowId ? undefined : customWindowText,
          status: preferredWindowId ? "new" : "needs_clarification",
        };
        return updated;
      });
      markWindowOffered(snapshot, preferredWindowId);
      if (previousWindowId && previousWindowId !== preferredWindowId) {
        releaseWindowIfUnused(snapshot, previousWindowId);
      }
      return updated;
    });
  },

  async updateClientNotes(id: string, notes: string) {
    return mutateSnapshot((snapshot) => {
      let updated: Client | null = null;
      snapshot.clients = snapshot.clients.map((client) => {
        if (client.id !== id) {
          return client;
        }

        updated = { ...client, notes };
        return updated;
      });
      return updated;
    });
  },

  async deleteClient(id: string) {
    return mutateSnapshot((snapshot) => {
      const clientRequests = snapshot.requests.filter((request) => request.clientId === id);
      if (!snapshot.clients.some((client) => client.id === id)) {
        return false;
      }

      const removedPhotoIds = new Set(clientRequests.flatMap((request) => request.photoIds));
      const affectedWindowIds = new Set(
        clientRequests
          .map((request) => request.preferredWindowId)
          .filter((windowId): windowId is string => Boolean(windowId)),
      );

      snapshot.clients = snapshot.clients.filter((client) => client.id !== id);
      snapshot.requests = snapshot.requests.filter((request) => request.clientId !== id);
      snapshot.appointments = snapshot.appointments.filter((appointment) => appointment.clientId !== id);
      snapshot.photos = snapshot.photos.filter((photo) => !removedPhotoIds.has(photo.id));

      snapshot.windows = snapshot.windows.map((window) => {
        if (!affectedWindowIds.has(window.id)) {
          return window;
        }

        const stillOffered = snapshot.requests.some(
          (request) => request.preferredWindowId === window.id && request.status !== "declined",
        );

        return !stillOffered && window.status === "offered"
          ? { ...window, status: "available" }
          : window;
      });

      return true;
    });
  },

  async createServiceOption(option: ServiceOption) {
    await mutateSnapshot((snapshot) => {
      snapshot.serviceOptions = [...snapshot.serviceOptions, option].sort((a, b) => a.title.localeCompare(b.title));
    });
    return option;
  },

  async updateServiceOption(id: string, patch: Partial<ServiceOption>) {
    return mutateSnapshot((snapshot) => {
      let updated: ServiceOption | null = null;
      snapshot.serviceOptions = snapshot.serviceOptions.map((option) => {
        if (option.id !== id) {
          return option;
        }

        updated = { ...option, ...patch };
        return updated;
      });
      return updated;
    });
  },

  async deleteServiceOption(id: string) {
    return mutateSnapshot((snapshot) => {
      const before = snapshot.serviceOptions.length;
      snapshot.serviceOptions = snapshot.serviceOptions.filter((option) => option.id !== id);
      snapshot.services = snapshot.services.map((service) => ({
        ...service,
        options: service.options.filter((optionId) => optionId !== id),
      }));
      return snapshot.serviceOptions.length !== before;
    });
  },

  async createService(service: ServicePreset) {
    await mutateSnapshot((snapshot) => {
      snapshot.services = [...snapshot.services, service].sort((a, b) => a.title.localeCompare(b.title));
    });
    return service;
  },

  async updateService(id: string, patch: Partial<ServicePreset>) {
    return mutateSnapshot((snapshot) => {
      let updated: ServicePreset | null = null;
      snapshot.services = snapshot.services.map((service) => {
        if (service.id !== id) {
          return service;
        }

        updated = { ...service, ...patch };
        return updated;
      });
      return updated;
    });
  },

  async deleteService(id: string) {
    return mutateSnapshot((snapshot) => {
      const before = snapshot.services.length;
      snapshot.services = snapshot.services.filter((service) => service.id !== id);
      return snapshot.services.length !== before;
    });
  },

  async createTimeWindow(window: TimeWindow) {
    const normalizedWindow: TimeWindow = {
      ...window,
      label: makeWindowLabel(window.startAt, window.endAt),
      status: "available",
    };

    await mutateSnapshot((snapshot) => {
      if (window.status !== "available") {
        throw new DomainError("Новое окошко можно создать только свободным.");
      }

      const conflict = getWindowConflict(window, snapshot.windows);

      if (conflict) {
        throw new DomainError(conflict);
      }

      snapshot.windows = [
        ...snapshot.windows,
        normalizedWindow,
      ].sort((a, b) => a.startAt.localeCompare(b.startAt));
    });
    return normalizedWindow;
  },

  async updateTimeWindowStatus(id: string, status: TimeWindowStatus) {
    return mutateSnapshot((snapshot) => {
      let updated: TimeWindow | null = null;
      const currentWindow = snapshot.windows.find((window) => window.id === id) ?? null;

      if (!currentWindow) {
        return null;
      }

      const transitionError = getWindowStatusError(snapshot, currentWindow, status);

      if (transitionError) {
        throw new DomainError(transitionError);
      }

      snapshot.windows = snapshot.windows.map((window) => {
        if (window.id !== id) {
          return window;
        }

        updated = { ...window, status };
        return updated;
      });
      return updated;
    });
  },

  async moveAppointment(appointmentId: string, windowId: string) {
    return mutateSnapshot((snapshot) => {
      const appointment = snapshot.appointments.find((item) => item.id === appointmentId);
      const targetWindow = snapshot.windows.find((item) => item.id === windowId);

      if (!appointment || !targetWindow || appointment.status !== "scheduled") {
        return null;
      }

      const oldWindow = snapshot.windows.find(
        (item) =>
          item.startAt === appointment.startAt &&
          item.endAt === appointment.endAt &&
          item.status === "reserved",
      );

      if (!oldWindow) {
        return null;
      }

      if (targetWindow.id === oldWindow.id) {
        return appointment;
      }

      if (targetWindow.status !== "available") {
        throw new DomainError("Перенести можно только в свободное окошко.");
      }

      snapshot.windows = snapshot.windows.map((window) => {
        if (window.id === oldWindow.id) {
          return { ...window, status: "available" };
        }
        if (window.id === targetWindow.id) {
          return { ...window, status: "reserved" };
        }
        return window;
      });

      const updated: Appointment = {
        ...appointment,
        startAt: targetWindow.startAt,
        endAt: targetWindow.endAt,
      };

      snapshot.appointments = snapshot.appointments.map((item) =>
        item.id === appointment.id ? updated : item,
      );
      snapshot.requests = snapshot.requests.map((request) =>
        request.id === appointment.requestId ? { ...request, preferredWindowId: targetWindow.id } : request,
      );

      return updated;
    });
  },

  async updateAppointmentStatus(id: string, status: Appointment["status"]) {
    return mutateSnapshot((snapshot) => {
      let updated: Appointment | null = null;
      snapshot.appointments = snapshot.appointments.map((appointment) => {
        if (appointment.id !== id) {
          return appointment;
        }
        updated = {
          ...appointment,
          status,
          cancelledAt: status === "cancelled" ? new Date().toISOString() : appointment.cancelledAt,
        };
        return updated;
      });

      if (status === "cancelled" && updated) {
        snapshot.windows = snapshot.windows.map((window) => {
          if (
            window.status === "reserved" &&
            window.startAt === updated?.startAt &&
            window.endAt === updated?.endAt
          ) {
            return { ...window, status: "available" };
          }
          return window;
        });
        snapshot.requests = snapshot.requests.map((request) =>
          request.id === updated?.requestId && request.status === "confirmed"
            ? { ...request, status: "declined", preferredWindowId: null }
            : request,
        );
      }

      return updated;
    });
  },

  async deleteAppointment(id: string) {
    return mutateSnapshot((snapshot) => {
      const appointment = snapshot.appointments.find((item) => item.id === id);

      if (!appointment) {
        return false;
      }

      snapshot.appointments = snapshot.appointments.filter((item) => item.id !== id);
      snapshot.windows = snapshot.windows.map((window) => {
        if (
          window.status === "reserved" &&
          window.startAt === appointment.startAt &&
          window.endAt === appointment.endAt
        ) {
          return { ...window, status: "available" };
        }

        return window;
      });
      snapshot.requests = snapshot.requests.map((request) =>
        request.id === appointment.requestId && request.status === "confirmed"
          ? { ...request, status: "declined", preferredWindowId: null }
          : request,
      );

      return true;
    });
  },

  async markAppointmentReminder(id: string, kind: "24h" | "3h", sentAt: string) {
    return mutateSnapshot((snapshot) => {
      let updated: Appointment | null = null;
      snapshot.appointments = snapshot.appointments.map((appointment) => {
        if (appointment.id !== id) {
          return appointment;
        }
        updated = {
          ...appointment,
          reminder24hSentAt: kind === "24h" ? sentAt : appointment.reminder24hSentAt,
          reminder3hSentAt: kind === "3h" ? sentAt : appointment.reminder3hSentAt,
        };
        return updated;
      });
      return updated;
    });
  },

  async markAppointmentSurveySent(id: string, sentAt: string) {
    return mutateSnapshot((snapshot) => {
      let updated: Appointment | null = null;
      snapshot.appointments = snapshot.appointments.map((appointment) => {
        if (appointment.id !== id) {
          return appointment;
        }
        updated = { ...appointment, surveySentAt: sentAt };
        return updated;
      });
      return updated;
    });
  },

  async submitAppointmentSurvey(id: string, payload: { rating: number; text?: string }) {
    return mutateSnapshot((snapshot) => {
      let updated: Appointment | null = null;
      snapshot.appointments = snapshot.appointments.map((appointment) => {
        if (appointment.id !== id) {
          return appointment;
        }
        updated = {
          ...appointment,
          surveyRating: payload.rating,
          surveyText: payload.text,
        };
        return updated;
      });
      return updated;
    });
  },

  async submitAppointmentSurveyByPublicToken(token: string, payload: { rating: number; text?: string }) {
    return mutateSnapshot((snapshot) => {
      let updated: Appointment | null = null;
      snapshot.appointments = snapshot.appointments.map((appointment) => {
        if (appointment.publicToken !== token) {
          return appointment;
        }
        updated = {
          ...appointment,
          surveyRating: payload.rating,
          surveyText: payload.text,
        };
        return updated;
      });
      return updated;
    });
  },

  async confirmBookingRequest(requestId: string) {
    return mutateSnapshot((snapshot) => {
      const request = snapshot.requests.find((item) => item.id === requestId);
      const existingAppointment = snapshot.appointments.find(
        (appointment) => appointment.requestId === requestId && appointment.status === "scheduled",
      );

      if (existingAppointment) {
        return existingAppointment;
      }

      const window = request?.preferredWindowId
        ? snapshot.windows.find((item) => item.id === request.preferredWindowId)
        : null;

      if (!request || request.status === "declined" || !window || window.status === "reserved" || window.status === "blocked") {
        return null;
      }

      assertWindowIsNotOwnedByAnotherActiveRequest(snapshot, window.id, request.id);

      const appointment: Appointment = ensureAppointmentPublicToken({
        id: `APT-${Date.now()}`,
        requestId: request.id,
        clientId: request.clientId,
        service: request.service,
        optionIds: request.optionIds,
        startAt: window.startAt,
        endAt: window.endAt,
        durationMinutes: request.estimatedMinutes,
        status: "scheduled",
      });

      snapshot.appointments = [appointment, ...snapshot.appointments];
      snapshot.requests = snapshot.requests.map((item) =>
        item.id === request.id ? { ...item, status: "confirmed" } : item,
      );
      snapshot.windows = snapshot.windows.map((item) =>
        item.id === window.id ? { ...item, status: "reserved" } : item,
      );

      return appointment;
    });
  },

  async confirmBookingRequestByClient(requestId: string) {
    return mutateSnapshot((snapshot) => {
      const request = snapshot.requests.find((item) => item.id === requestId);
      const existingAppointment = snapshot.appointments.find(
        (appointment) => appointment.requestId === requestId && appointment.status === "scheduled",
      );

      if (existingAppointment) {
        return existingAppointment;
      }

      if (!request || request.status !== "waiting_client") {
        return null;
      }
      const window = request.preferredWindowId
        ? snapshot.windows.find((item) => item.id === request.preferredWindowId)
        : null;

      if (!window || window.status === "reserved" || window.status === "blocked") {
        return null;
      }

      assertWindowIsNotOwnedByAnotherActiveRequest(snapshot, window.id, request.id);

      const appointment: Appointment = ensureAppointmentPublicToken({
        id: `APT-${Date.now()}`,
        requestId: request.id,
        clientId: request.clientId,
        service: request.service,
        optionIds: request.optionIds,
        startAt: window.startAt,
        endAt: window.endAt,
        durationMinutes: request.estimatedMinutes,
        status: "scheduled",
      });

      snapshot.appointments = [appointment, ...snapshot.appointments];
      snapshot.requests = snapshot.requests.map((item) =>
        item.id === request.id ? { ...item, status: "confirmed" } : item,
      );
      snapshot.windows = snapshot.windows.map((item) =>
        item.id === window.id ? { ...item, status: "reserved" } : item,
      );

      return appointment;
    });
  },

  async confirmBookingRequestByPublicToken(token: string) {
    const snapshot = await readSnapshot();
    const request = snapshot.requests.find((item) => item.publicToken === token) ?? null;

    if (!request) {
      return null;
    }

    return fileRepository.confirmBookingRequestByClient(request.id);
  },
};
