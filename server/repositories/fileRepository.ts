import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  Appointment,
  BookingRequest,
  Client,
  RequestStatus,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../src/types.js";
import { seedClients, seedPhotos, seedRequests, serviceOptions, servicePresets, timeWindows } from "../../src/data.js";
import { config } from "../config.js";
import type { AppSnapshot, PublicBookingConfig, Repository } from "./types.js";

const emptySnapshot: AppSnapshot = {
  clients: [],
  photos: [],
  requests: [],
  appointments: [],
  windows: [],
  services: [],
  serviceOptions: [],
};

async function readSnapshot(): Promise<AppSnapshot> {
  try {
    const raw = await readFile(config.fileStoragePath, "utf8");
    const parsed = JSON.parse(raw) as AppSnapshot;
    return { ...emptySnapshot, ...parsed };
  } catch {
    return { ...emptySnapshot };
  }
}

async function writeSnapshot(snapshot: AppSnapshot) {
  await mkdir(dirname(config.fileStoragePath), { recursive: true });
  await writeFile(config.fileStoragePath, JSON.stringify(snapshot, null, 2), "utf8");
}

async function mutateSnapshot<T>(callback: (snapshot: AppSnapshot) => T | Promise<T>) {
  const snapshot = await readSnapshot();
  const result = await callback(snapshot);
  await writeSnapshot(snapshot);
  return result;
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
      windows: snapshot.windows.filter((window) => window.status === "available"),
      serviceOptions: snapshot.serviceOptions,
    };
  },

  async getBookingRequest(id: string) {
    const snapshot = await readSnapshot();
    return snapshot.requests.find((request) => request.id === id) ?? null;
  },

  async getAppointment(id: string) {
    const snapshot = await readSnapshot();
    return snapshot.appointments.find((appointment) => appointment.id === id) ?? null;
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
    await mutateSnapshot((snapshot) => {
      snapshot.clients = [payload.client, ...snapshot.clients.filter((client) => client.id !== payload.client.id)];
      snapshot.photos = [
        ...payload.photos,
        ...snapshot.photos.filter((photo) => !payload.photos.some((item) => item.id === photo.id)),
      ];
      snapshot.requests = [payload.request, ...snapshot.requests];
      markWindowOffered(snapshot, payload.request.preferredWindowId);
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
          status === "declined"
            ? { ...request, status, preferredWindowId: null }
            : { ...request, status };
        return updated;
      });
      if (status === "declined") {
        releaseWindowIfUnused(snapshot, previousWindowId);
      }
      return updated;
    });
  },

  async updateRequestWindow(id: string, preferredWindowId: string | null, customWindowText?: string) {
    return mutateSnapshot((snapshot) => {
      let updated: BookingRequest | null = null;
      let previousWindowId: string | null = null;
      snapshot.requests = snapshot.requests.map((request) => {
        if (request.id !== id) {
          return request;
        }

        previousWindowId = request.preferredWindowId;
        updated = { ...request, preferredWindowId, customWindowText, status: "waiting_client" };
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
    await mutateSnapshot((snapshot) => {
      snapshot.windows = [...snapshot.windows, window].sort((a, b) => a.startAt.localeCompare(b.startAt));
    });
    return window;
  },

  async updateTimeWindowStatus(id: string, status: TimeWindowStatus) {
    return mutateSnapshot((snapshot) => {
      let updated: TimeWindow | null = null;
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

      if (!appointment || !targetWindow || targetWindow.status !== "available") {
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
      }

      return updated;
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

  async confirmBookingRequest(requestId: string) {
    return mutateSnapshot((snapshot) => {
      const request = snapshot.requests.find((item) => item.id === requestId);
      const window = request?.preferredWindowId
        ? snapshot.windows.find((item) => item.id === request.preferredWindowId)
        : null;

      if (!request || !window || window.status === "reserved" || window.status === "blocked") {
        return null;
      }

      const appointment: Appointment = {
        id: `APT-${Date.now()}`,
        requestId: request.id,
        clientId: request.clientId,
        service: request.service,
        optionIds: request.optionIds,
        startAt: window.startAt,
        endAt: window.endAt,
        durationMinutes: request.estimatedMinutes,
        status: "scheduled",
      };

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
      if (!request || request.status !== "waiting_client") {
        return null;
      }
      const window = request.preferredWindowId
        ? snapshot.windows.find((item) => item.id === request.preferredWindowId)
        : null;

      if (!window || window.status === "reserved" || window.status === "blocked") {
        return null;
      }

      const appointment: Appointment = {
        id: `APT-${Date.now()}`,
        requestId: request.id,
        clientId: request.clientId,
        service: request.service,
        optionIds: request.optionIds,
        startAt: window.startAt,
        endAt: window.endAt,
        durationMinutes: request.estimatedMinutes,
        status: "scheduled",
      };

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
};
