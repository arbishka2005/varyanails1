import { useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage, isApiAuthError } from "../api";
import { servicePresets } from "../data";
import type { AppSnapshot, PublicBookingConfig } from "../types";
import { useAdminActions } from "./useAdminActions";
import { useAppShell } from "./useAppShell";
import { useClientBookingFlow } from "./useClientBookingFlow";

type PublicConfig = Pick<AppSnapshot, "services" | "serviceOptions" | "windows">;

export function useAppController() {
  const shell = useAppShell();
  const { route } = shell;
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [adminAccessDenied, setAdminAccessDenied] = useState(false);

  const clients = snapshot?.clients ?? [];
  const photos = snapshot?.photos ?? [];
  const requests = snapshot?.requests ?? [];
  const appointments = snapshot?.appointments ?? [];
  const windows = route.portal === "admin" ? (snapshot?.windows ?? []) : (publicConfig?.windows ?? []);
  const serviceOptions = route.portal === "admin" ? (snapshot?.serviceOptions ?? []) : (publicConfig?.serviceOptions ?? []);
  const services =
    route.portal === "admin"
      ? snapshot?.services.length ? snapshot.services : servicePresets
      : publicConfig?.services.length ? publicConfig.services : servicePresets;

  const refreshSnapshot = async () => {
    try {
      setApiError(null);
      setAdminAccessDenied(false);
      const nextSnapshot = await api.getSnapshot();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (error) {
      if (isApiAuthError(error)) {
        setAdminAccessDenied(true);
        setApiError("Нет доступа к админ-панели. Откройте приложение через Telegram.");
      } else {
        setApiError(getApiErrorMessage(error, "Не удалось подключиться к API"));
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshPublicConfig = async (): Promise<PublicBookingConfig | null> => {
    try {
      setApiError(null);
      const nextConfig = await api.getPublicBookingConfig();
      setPublicConfig({
        services: nextConfig.services,
        serviceOptions: nextConfig.serviceOptions,
        windows: nextConfig.windows,
      });
      return nextConfig;
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось загрузить публичные настройки записи"));
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    if (route.portal === "admin") {
      void refreshSnapshot();
      return;
    }

    void refreshPublicConfig();
  }, [route.portal]);

  const client = useClientBookingFlow({
    route,
    services,
    windows,
    refreshPublicConfig,
    setApiError,
  });

  const adminActions = useAdminActions({
    snapshot,
    requests,
    refreshSnapshot,
    setApiError,
    setSnapshot,
  });

  const adminOverviewCounts = useMemo(
    () => ({
      newRequests: requests.filter((request) => request.status === "new").length,
      scheduledAppointments: appointments.filter((appointment) => appointment.status === "scheduled").length,
      availableWindows: windows.filter((window) => window.status === "available").length,
      clients: clients.filter((client) => !client.archivedAt).length,
    }),
    [appointments, clients, requests, windows],
  );

  return {
    shell,
    status: {
      isLoading,
      apiError,
      adminAccessDenied,
    },
    data: {
      services,
      windows,
      clients,
      photos,
      requests,
      appointments,
      serviceOptions,
    },
    client,
    admin: {
      overviewCounts: adminOverviewCounts,
      actions: adminActions,
    },
  };
}
