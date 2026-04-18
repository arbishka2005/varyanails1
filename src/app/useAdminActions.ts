import type { Dispatch, SetStateAction } from "react";
import { api, getApiErrorMessage } from "../api";
import { makeWindowLabel } from "../lib/displayTime";
import { getWindowConflict, isFutureDateTime } from "../lib/dateTime";
import type {
  AppSnapshot,
  RequestStatus,
  ServiceKind,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../types";

type UseAdminActionsOptions = {
  snapshot: AppSnapshot | null;
  requests: AppSnapshot["requests"];
  refreshSnapshot: () => Promise<AppSnapshot | null>;
  setApiError: Dispatch<SetStateAction<string | null>>;
  setSnapshot: Dispatch<SetStateAction<AppSnapshot | null>>;
};

function makeAdminScopedId(prefix: "WIN") {
  const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${randomPart}`;
}

export function useAdminActions({
  snapshot,
  requests,
  refreshSnapshot,
  setApiError,
  setSnapshot,
}: UseAdminActionsOptions) {
  const updateStatus = async (id: string, status: RequestStatus) => {
    try {
      setApiError(null);
      await api.updateRequestStatus(id, status);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось обновить статус заявки"));
      await refreshSnapshot();
      return false;
    }
  };

  const updateWindow = async (id: string, preferredWindowId: string | null, customWindowText?: string) => {
    const request = requests.find((item) => item.id === id);

    if (!request) {
      await refreshSnapshot();
      return false;
    }

    setSnapshot((current) =>
      current
        ? {
            ...current,
            requests: current.requests.map((item) =>
              item.id === id
                ? {
                    ...item,
                    preferredWindowId,
                    customWindowText,
                    status: preferredWindowId ? "new" : "needs_clarification",
                  }
                : item,
            ),
          }
        : current,
    );

    try {
      setApiError(null);
      await api.updateRequestWindow(id, preferredWindowId, customWindowText);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось предложить другое окошко"));
      await refreshSnapshot();
      return false;
    }
  };

  const updateService = async (
    id: ServiceKind,
    patch: Omit<Partial<ServicePreset>, "priceFrom"> & { priceFrom?: number | null },
  ) => {
    try {
      setApiError(null);
      await api.updateService(id, patch);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось обновить услугу"));
      return false;
    }
  };

  const createService = async (service: ServicePreset) => {
    try {
      setApiError(null);
      await api.createService(service);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось добавить услугу"));
      return false;
    }
  };

  const deleteService = async (id: ServiceKind) => {
    try {
      setApiError(null);
      await api.deleteService(id);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось удалить услугу"));
      return false;
    }
  };

  const addTimeWindow = async (window: Omit<TimeWindow, "id" | "label" | "status">) => {
    if (!isFutureDateTime(window.startAt)) {
      setApiError("Окошко должно начинаться в будущем.");
      return false;
    }

    const conflict = getWindowConflict(window, snapshot?.windows ?? []);

    if (conflict) {
      setApiError(conflict);
      return false;
    }

    const nextWindow: TimeWindow = {
      ...window,
      id: makeAdminScopedId("WIN"),
      status: "available",
      label: makeWindowLabel(window.startAt, window.endAt),
    };

    try {
      setApiError(null);
      await api.createTimeWindow(nextWindow);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось добавить окошко"));
      await refreshSnapshot();
      return false;
    }
  };

  const updateWindowStatus = async (id: string, status: TimeWindowStatus) => {
    try {
      setApiError(null);
      await api.updateTimeWindowStatus(id, status);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось изменить окошко"));
      await refreshSnapshot();
      return false;
    }
  };

  const moveAppointment = async (appointmentId: string, windowId: string) => {
    try {
      setApiError(null);
      await api.moveAppointment(appointmentId, windowId);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось перенести запись"));
      await refreshSnapshot();
      return false;
    }
  };

  const updateAppointmentStatus = async (
    appointmentId: string,
    status: AppSnapshot["appointments"][number]["status"],
  ) => {
    try {
      setApiError(null);
      await api.updateAppointmentStatus(appointmentId, status);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось обновить статус записи"));
      await refreshSnapshot();
      return false;
    }
  };

  const deleteAppointment = async (appointmentId: string) => {
    try {
      setApiError(null);
      await api.deleteAppointment(appointmentId);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось удалить запись"));
      await refreshSnapshot();
      return false;
    }
  };

  const updateClientNotes = async (id: string, notes: string) => {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            clients: current.clients.map((client) => (client.id === id ? { ...client, notes } : client)),
          }
        : current,
    );

    try {
      setApiError(null);
      await api.updateClientNotes(id, notes);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось обновить заметку клиента"));
      await refreshSnapshot();
      return false;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      setApiError(null);
      await api.deleteClient(id);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось удалить клиента"));
      await refreshSnapshot();
      return false;
    }
  };

  const confirmRequest = async (requestId: string) => {
    try {
      setApiError(null);
      await api.confirmBookingRequest(requestId);
      await refreshSnapshot();
      return true;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось подтвердить заявку"));
      await refreshSnapshot();
      return false;
    }
  };

  return {
    confirmRequest,
    updateStatus,
    updateWindow,
    updateService,
    createService,
    deleteService,
    addTimeWindow,
    updateWindowStatus,
    moveAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    updateClientNotes,
    deleteClient,
  };
}
