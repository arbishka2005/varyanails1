import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../api";
import { servicePresets, timeWindows } from "../data";
import {
  BOOKING_DRAFT_STORAGE_KEY,
  customWindowValue,
  initialBookingDraftUiState,
  initialForm,
  type BookingDraft,
  type BookingDraftUiState,
  type ClientFormatQuestion,
  type ClientFormStep,
  type FormState,
} from "../features/booking/formState";
import { getTelegramUser, getTelegramWebApp, getRouteFromHash, getStartParam, navigateToAdminSection, navigateToClientSection, type AdminSection, type AppRoute, type ClientSection } from "./navigation";
import { readFileAsDataUrl } from "../lib/file";
import { lengthLabels, makeWindowLabel } from "../lib/bookingPresentation";
import { toStoredPhone } from "../lib/phone";
import type {
  AppSnapshot,
  BookingRequest,
  Client,
  PhotoAttachment,
  PublicBookingAccess,
  PublicBookingRequest,
  RequestStatus,
  ServiceKind,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../types";

const LAST_REQUEST_STORAGE_KEY = "varyanails:lastRequestAccess";

type LastRequestAccess = PublicBookingAccess;

const clientFormSteps: ClientFormStep[] = ["service", "time", "photos", "contact"];
const clientFormatQuestions: ClientFormatQuestion[] = ["service", "length", "visit", "details"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPhotoAttachmentDraft(value: unknown): value is PhotoAttachment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "hands" || value.kind === "reference") &&
    typeof value.fileName === "string" &&
    (value.previewUrl === undefined || typeof value.previewUrl === "string")
  );
}

function normalizeDraftForm(value: unknown): FormState | null {
  if (!isRecord(value)) {
    return null;
  }

  const contactChannel =
    value.contactChannel === "telegram" || value.contactChannel === "vk" || value.contactChannel === "phone"
      ? value.contactChannel
      : initialForm.contactChannel;
  const length =
    value.length === "short" || value.length === "medium" || value.length === "long" || value.length === "extra"
      ? value.length
      : initialForm.length;

  return {
    clientName: typeof value.clientName === "string" ? value.clientName : initialForm.clientName,
    phone: typeof value.phone === "string" ? value.phone : initialForm.phone,
    contactChannel,
    contactHandle: typeof value.contactHandle === "string" ? value.contactHandle : initialForm.contactHandle,
    isNewClient: typeof value.isNewClient === "boolean" ? value.isNewClient : initialForm.isNewClient,
    service: typeof value.service === "string" && value.service ? value.service : initialForm.service,
    optionIds: Array.isArray(value.optionIds)
      ? value.optionIds.filter((optionId): optionId is string => typeof optionId === "string")
      : initialForm.optionIds,
    length,
    desiredResult: typeof value.desiredResult === "string" ? value.desiredResult : initialForm.desiredResult,
    handPhoto: isPhotoAttachmentDraft(value.handPhoto) ? value.handPhoto : null,
    referencePhoto: isPhotoAttachmentDraft(value.referencePhoto) ? value.referencePhoto : null,
    preferredWindowId:
      typeof value.preferredWindowId === "string" && value.preferredWindowId
        ? value.preferredWindowId
        : initialForm.preferredWindowId,
    customWindowText:
      typeof value.customWindowText === "string" ? value.customWindowText : initialForm.customWindowText,
    comment: typeof value.comment === "string" ? value.comment : initialForm.comment,
  };
}

function normalizeDraftUi(value: unknown): BookingDraftUiState {
  if (!isRecord(value)) {
    return initialBookingDraftUiState;
  }

  const currentStep = clientFormSteps.includes(value.currentStep as ClientFormStep)
    ? (value.currentStep as ClientFormStep)
    : initialBookingDraftUiState.currentStep;
  const formatQuestion = clientFormatQuestions.includes(value.formatQuestion as ClientFormatQuestion)
    ? (value.formatQuestion as ClientFormatQuestion)
    : initialBookingDraftUiState.formatQuestion;

  return { currentStep, formatQuestion };
}

function readBookingDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    const form = normalizeDraftForm(parsed.form);

    if (form) {
      return {
        form,
        ui: normalizeDraftUi(parsed.ui),
      };
    }
  } catch {
    // Ignore stale or corrupted draft and clear it below.
  }

  clearBookingDraftStorage();
  return null;
}

function isInitialBookingDraft(form: FormState, ui: BookingDraftUiState) {
  return (
    JSON.stringify(form) === JSON.stringify(initialForm) &&
    ui.currentStep === initialBookingDraftUiState.currentStep &&
    ui.formatQuestion === initialBookingDraftUiState.formatQuestion
  );
}

function clearBookingDraftStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in strict browser modes.
  }
}

function readLastRequestAccess() {
  if (typeof window === "undefined") {
    return null;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(LAST_REQUEST_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LastRequestAccess>;

    if (typeof parsed.requestId === "string" && typeof parsed.publicToken === "string") {
      return {
        requestId: parsed.requestId,
        publicToken: parsed.publicToken,
      } satisfies LastRequestAccess;
    }
  } catch {
    // Ignore stale value from older builds and clear it below.
  }

  try {
    window.localStorage.removeItem(LAST_REQUEST_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in strict browser modes.
  }

  return null;
}

type PublicConfig = Pick<AppSnapshot, "services" | "windows">;

export function useAppController() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash());
  const [lastRequestAccess, setLastRequestAccess] = useState<LastRequestAccess | null>(() => readLastRequestAccess());
  const [lastRequestInfo, setLastRequestInfo] = useState<PublicBookingRequest | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [adminAccessDenied, setAdminAccessDenied] = useState(false);
  const [initialBookingDraft] = useState(() => readBookingDraft());
  const [form, setForm] = useState<FormState>(() => initialBookingDraft?.form ?? initialForm);
  const [bookingDraftUi, setBookingDraftUi] = useState<BookingDraftUiState>(
    () => initialBookingDraft?.ui ?? initialBookingDraftUiState,
  );
  const [uploading, setUploading] = useState({ hands: false, reference: false });
  const [uploadError, setUploadError] = useState({ hands: "", reference: "" });

  const clients = snapshot?.clients ?? [];
  const photos = snapshot?.photos ?? [];
  const requests = snapshot?.requests ?? [];
  const appointments = snapshot?.appointments ?? [];
  const windows = route.portal === "admin" ? (snapshot?.windows ?? []) : (publicConfig?.windows ?? timeWindows);
  const services =
    route.portal === "admin"
      ? snapshot?.services.length ? snapshot.services : servicePresets
      : publicConfig?.services.length ? publicConfig.services : servicePresets;
  const telegramWebApp = getTelegramWebApp();
  const isTelegramMiniApp = Boolean(telegramWebApp);
  const telegramInitData = telegramWebApp?.initData ?? "";
  const telegramUser = telegramWebApp?.initDataUnsafe?.user;
  const startParam = getStartParam();
  const locationPath = window.location.pathname;
  const locationHash = window.location.hash;
  const setBookingDraftStep = (value: ClientFormStep | ((current: ClientFormStep) => ClientFormStep)) => {
    setBookingDraftUi((current) => ({
      ...current,
      currentStep: typeof value === "function" ? value(current.currentStep) : value,
    }));
  };
  const setBookingDraftFormatQuestion = (
    value: ClientFormatQuestion | ((current: ClientFormatQuestion) => ClientFormatQuestion),
  ) => {
    setBookingDraftUi((current) => ({
      ...current,
      formatQuestion: typeof value === "function" ? value(current.formatQuestion) : value,
    }));
  };

  const refreshSnapshot = async () => {
    try {
      setApiError(null);
      setAdminAccessDenied(false);
      const nextSnapshot = await api.getSnapshot();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdminAccessDenied(true);
        setApiError("Нет доступа к админ-панели. Откройте приложение через Telegram.");
      } else {
        setApiError(error instanceof Error ? error.message : "Не удалось подключиться к API");
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshPublicConfig = async () => {
    try {
      setApiError(null);
      const nextConfig = await api.getPublicBookingConfig();
      setPublicConfig({
        services: nextConfig.services,
        windows: nextConfig.windows,
      });
      return nextConfig;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось загрузить публичные настройки записи");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshLastRequest = async (publicToken: string) => {
    try {
      const info = await api.getPublicBookingRequest(publicToken);
      setLastRequestInfo(info);
      if (info.request.publicToken) {
        setLastRequestAccess({
          requestId: info.request.id,
          publicToken: info.request.publicToken,
        });
      }
      return info;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось обновить статус заявки");
      return null;
    }
  };

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      return;
    }

    const path = window.location.pathname.replace(/^\/+/, "");

    if (path.startsWith("admin") || path.startsWith("survey")) {
      window.location.hash = `/${path}`;
    }
  }, []);

  useEffect(() => {
    const webApp = getTelegramWebApp();

    if (!webApp) {
      return;
    }

    const updateViewportHeight = () => {
      const height = webApp.viewportStableHeight || webApp.viewportHeight;
      if (height) {
        document.documentElement.style.setProperty("--tg-viewport-height", `${height}px`);
      }
    };

    webApp.ready?.();
    webApp.expand?.();
    updateViewportHeight();
    webApp.onEvent?.("viewportChanged", updateViewportHeight);

    return () => {
      webApp.offEvent?.("viewportChanged", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    const user = getTelegramUser();

    if (!user) {
      return;
    }

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    const handle = user.username ? `@${user.username}` : "";

    setForm((current) => ({
      ...current,
      clientName: current.clientName || fullName,
      contactChannel: "telegram",
      contactHandle: current.contactHandle || handle,
    }));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    if (route.portal === "admin") {
      void refreshSnapshot();
      return;
    }

    void refreshPublicConfig();
  }, [route.portal]);

  useEffect(() => {
    if (route.portal !== "client" || !lastRequestAccess?.publicToken) {
      return;
    }

    void refreshLastRequest(lastRequestAccess.publicToken);
  }, [lastRequestAccess?.publicToken, route.portal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (lastRequestAccess) {
        window.localStorage.setItem(LAST_REQUEST_STORAGE_KEY, JSON.stringify(lastRequestAccess));
        return;
      }

      window.localStorage.removeItem(LAST_REQUEST_STORAGE_KEY);
    } catch {
      // Status history is optional; keep the app usable if persistence fails.
    }
  }, [lastRequestAccess]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (route.portal !== "client" || route.section !== "booking") {
      return;
    }

    if (isInitialBookingDraft(form, bookingDraftUi)) {
      clearBookingDraftStorage();
      return;
    }

    const draft: BookingDraft = {
      version: 1,
      savedAt: new Date().toISOString(),
      form,
      ui: bookingDraftUi,
    };

    try {
      window.localStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore quota/private-mode errors. The booking flow must remain usable.
    }
  }, [bookingDraftUi, form, route]);

  useEffect(() => {
    if (!services.length) {
      return;
    }

    setForm((current) => {
      if (services.some((service) => service.id === current.service)) {
        return current;
      }

      return {
        ...current,
        service: services[0].id,
      };
    });
  }, [services]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.service) ?? services[0] ?? servicePresets[0],
    [form.service, services],
  );

  const estimatedMinutes = useMemo(() => {
    const lengthBoost = { short: 0, medium: 15, long: 30, extra: 45 }[form.length];
    return selectedService.durationMinutes + lengthBoost;
  }, [form.length, selectedService.durationMinutes]);

  const estimatedPriceFrom = useMemo(() => selectedService.priceFrom ?? 0, [selectedService.priceFrom]);

  const normalizedDesiredResult = useMemo(() => {
    const customText = form.desiredResult.trim();

    if (customText) {
      return customText;
    }

    return [selectedService.title, lengthLabels[form.length]].join(" - ");
  }, [form.desiredResult, form.length, selectedService.title]);

  const submitRequest = async () => {
    const client: Client = {
      id: `CLI-${Date.now()}`,
      name: form.clientName.trim(),
      phone: toStoredPhone(form.phone),
      preferredContactChannel: form.contactChannel,
      contactHandle: form.contactHandle.trim(),
      firstVisit: form.isNewClient,
    };
    const newPhotos: PhotoAttachment[] = [form.handPhoto, form.referencePhoto].filter(
      (photo): photo is PhotoAttachment => Boolean(photo),
    );
    const request: BookingRequest = {
      id: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      clientId: client.id,
      service: form.service,
      optionIds: form.optionIds,
      length: form.length,
      desiredResult: normalizedDesiredResult,
      photoIds: newPhotos.map((photo) => photo.id),
      preferredWindowId: form.preferredWindowId === customWindowValue ? null : form.preferredWindowId,
      customWindowText:
        form.preferredWindowId === customWindowValue ? form.customWindowText.trim() : undefined,
      comment: form.comment.trim(),
      estimatedMinutes,
      estimatedPriceFrom,
      status: "new",
      createdAt: new Date().toISOString(),
    };

    try {
      setApiError(null);
      const access = await api.createBookingRequest({ client, photos: newPhotos, request });
      setLastRequestAccess(access);
      await refreshLastRequest(access.publicToken);
      clearBookingDraftStorage();
      setBookingDraftUi(initialBookingDraftUiState);
      setForm(initialForm);
      navigateToClientSection("requests");
      return true;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось отправить заявку");
      return false;
    }
  };

  const confirmClientWindow = async (requestToken: string) => {
    try {
      setApiError(null);
      await api.confirmPublicBookingRequest(requestToken);
      await refreshLastRequest(requestToken);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось подтвердить время");
    }
  };

  const uploadPhoto = async (kind: PhotoAttachment["kind"], file: File) => {
    const key = kind === "hands" ? "hands" : "reference";
    setUploading((current) => ({ ...current, [key]: true }));
    setUploadError((current) => ({ ...current, [key]: "" }));

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await api.uploadPhoto({
        kind,
        fileName: file.name,
        dataUrl,
      });
      setForm((current) => ({
        ...current,
        handPhoto: kind === "hands" ? uploaded : current.handPhoto,
        referencePhoto: kind === "reference" ? uploaded : current.referencePhoto,
      }));
      return uploaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить фото";
      setUploadError((current) => ({ ...current, [key]: message }));
      return null;
    } finally {
      setUploading((current) => ({ ...current, [key]: false }));
    }
  };

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
                ? { ...item, preferredWindowId, customWindowText, status: "waiting_client" }
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
      await updateStatus(requestId, "needs_clarification");
    }
  };

  const availableBookingWindows = useMemo(
    () => windows.filter((window) => window.status === "available" || window.status === "offered"),
    [windows],
  );
  const lastSubmittedRequestId = lastRequestAccess?.requestId ?? lastRequestInfo?.request.id ?? null;
  const adminOverviewCounts = useMemo(
    () => ({
      newRequests: requests.filter((request) => request.status === "new").length,
      scheduledAppointments: appointments.filter((appointment) => appointment.status === "scheduled").length,
      availableWindows: windows.filter((window) => window.status === "available").length,
      clients: clients.length,
    }),
    [appointments, clients.length, requests, windows],
  );
  const hasClientRequest = Boolean(lastRequestInfo || lastRequestAccess);
  const openClientSection = (section: ClientSection) => navigateToClientSection(section);
  const openAdminSection = (section: AdminSection) => navigateToAdminSection(section);
  const openBookingFlow = (serviceId?: ServiceKind) => {
    if (serviceId) {
      setForm((current) => ({ ...current, service: serviceId }));
    }

    navigateToClientSection("booking");
  };

  return {
    route,
    form,
    bookingDraftUi,
    services,
    windows,
    clients,
    photos,
    requests,
    appointments,
    selectedService,
    estimatedMinutes,
    estimatedPriceFrom,
    availableBookingWindows,
    adminOverviewCounts,
    lastRequestInfo,
    lastSubmittedRequestId,
    hasClientRequest,
    isLoading,
    apiError,
    adminAccessDenied,
    isTelegramMiniApp,
    telegramInitData,
    telegramUser,
    startParam,
    locationPath,
    locationHash,
    uploading,
    uploadError,
    setForm,
    setBookingDraftStep,
    setBookingDraftFormatQuestion,
    openClientSection,
    openAdminSection,
    openBookingFlow,
    submitRequest,
    confirmClientWindow,
    refreshLastRequest,
    uploadPhoto,
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
