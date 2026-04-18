import type { Dispatch, SetStateAction } from "react";
import { api } from "../api";
import { makeWindowLabel } from "../lib/bookingPresentation";
import { getWindowConflict } from "../lib/dateTime";
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
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось обновить статус заявки");
    }
  };

  const updateWindow = async (id: string, preferredWindowId: string | null, customWindowText?: string) => {
    const request = requests.find((item) => item.id === id);

    if (!request) {
      return;
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
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось предложить другое окошко");
      await refreshSnapshot();
    }
  };

  const updateService = async (id: ServiceKind, patch: Partial<ServicePreset>) => {
    try {
      setApiError(null);
      await api.updateService(id, patch);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось обновить услугу");
    }
  };

  const createService = async (service: ServicePreset) => {
    try {
      setApiError(null);
      await api.createService(service);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось добавить услугу");
    }
  };

  const deleteService = async (id: ServiceKind) => {
    try {
      setApiError(null);
      await api.deleteService(id);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось удалить услугу");
    }
  };

  const addTimeWindow = async (window: Omit<TimeWindow, "id" | "label" | "status">) => {
    const conflict = getWindowConflict(window, snapshot?.windows ?? []);

    if (conflict) {
      setApiError(conflict);
      return;
    }

    const nextWindow: TimeWindow = {
      ...window,
      id: `WIN-${Date.now()}`,
      status: "available",
      label: makeWindowLabel(window.startAt, window.endAt),
    };

    try {
      setApiError(null);
      await api.createTimeWindow(nextWindow);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось добавить окошко");
    }
  };

  const updateWindowStatus = async (id: string, status: TimeWindowStatus) => {
    try {
      setApiError(null);
      await api.updateTimeWindowStatus(id, status);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось изменить окошко");
    }
  };

  const moveAppointment = async (appointmentId: string, windowId: string) => {
    try {
      setApiError(null);
      await api.moveAppointment(appointmentId, windowId);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось перенести запись");
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
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось обновить статус записи");
    }
  };

  const deleteAppointment = async (appointmentId: string) => {
    try {
      setApiError(null);
      await api.deleteAppointment(appointmentId);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось удалить запись");
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
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось обновить заметку клиента");
    }
  };

  const deleteClient = async (id: string) => {
    try {
      setApiError(null);
      await api.deleteClient(id);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось удалить клиента");
    }
  };

  const confirmRequest = async (requestId: string) => {
    try {
      setApiError(null);
      await api.confirmBookingRequest(requestId);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось подтвердить заявку");
      await refreshSnapshot();
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
