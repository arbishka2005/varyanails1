import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  History,
  MessageCircle,
  MoveRight,
  Phone,
  Plus,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  serviceOptions,
  servicePresets,
  timeWindows,
} from "./data";
import { ApiError, api } from "./api";
import heroMainImage from "./assets/hero-main.jpg";
import type {
  AppSnapshot,
  Appointment,
  BookingRequest,
  Client,
  ContactChannel,
  PhotoAttachment,
  PublicBookingRequest,
  NailLength,
  RequestStatus,
  ServiceKind,
  ServiceOptionKind,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "./types";

let runtimeServiceCatalog = servicePresets;
let runtimeOptionCatalog = serviceOptions;

const contactLabels: Record<ContactChannel, string> = {
  telegram: "Telegram",
  vk: "VK",
  phone: "Телефон",
};

const lengthLabels: Record<NailLength, string> = {
  short: "Короткая",
  medium: "Средняя",
  long: "Длинная",
  extra: "Очень длинная",
};

const statusLabels: Record<RequestStatus, string> = {
  new: "Новая заявка",
  needs_clarification: "Нужны уточнения",
  waiting_client: "Ждет клиента",
  confirmed: "Подтверждена",
  declined: "Отклонена",
};

type FormState = {
  clientName: string;
  phone: string;
  contactChannel: ContactChannel;
  contactHandle: string;
  isNewClient: boolean;
  service: ServiceKind;
  optionIds: ServiceOptionKind[];
  length: NailLength;
  desiredResult: string;
  handPhoto: PhotoAttachment | null;
  referencePhoto: PhotoAttachment | null;
  preferredWindowId: string;
  customWindowText: string;
  comment: string;
};

const customWindowValue = "custom";
type AdminSection = "requests" | "clients" | "settings";
type ClientStatusFilter = RequestStatus | "all";
type ClientFormStep = "contacts" | "service" | "photos" | "time" | "confirm";
type AppRoute =
  | { portal: "client" }
  | { portal: "admin"; section: AdminSection }
  | { portal: "survey"; appointmentId: string };
type ServiceEditorState = {
  title: string;
  durationMinutes: string;
  priceFrom: string;
  requiresHandPhoto: boolean;
  requiresReference: boolean;
  options: ServiceOptionKind[];
};
type OptionEditorState = {
  title: string;
  durationMinutes: string;
  priceFrom: string;
};

const initialForm: FormState = {
  clientName: "",
  phone: "",
  contactChannel: "telegram",
  contactHandle: "",
  isNewClient: true,
  service: "extension",
  optionIds: [],
  length: "medium",
  desiredResult: "",
  handPhoto: null,
  referencePhoto: null,
  preferredWindowId: timeWindows[0].id,
  customWindowText: "",
  comment: "",
};

function getStartParam(): string {
  const searchParams = new URLSearchParams(window.location.search);
  const queryParam =
    searchParams.get("startapp") ??
    searchParams.get("start_param") ??
    searchParams.get("tgWebAppStartParam") ??
    "";
  const webAppParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? "";
  return queryParam || webAppParam;
}

function getRouteFromHash(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const fallbackPath = window.location.pathname.replace(/^\/+/, "");
  const startParam = getStartParam();
  const pathFromStartParam = startParam.replace(/^\/+/, "");
  const routePath = hash || fallbackPath || pathFromStartParam;
  const [path, query] = routePath.split("?");

  if (path === "survey") {
    const params = new URLSearchParams(query ?? "");
    const appointmentId = params.get("appointment");
    if (appointmentId) {
      return { portal: "survey", appointmentId };
    }
  }

  if (path === "admin/clients") {
    return { portal: "admin", section: "clients" };
  }

  if (path === "admin/settings") {
    return { portal: "admin", section: "settings" };
  }

  if (path === "admin" || path === "admin/requests") {
    return { portal: "admin", section: "requests" };
  }

  return { portal: "client" };
}

function navigateTo(hash: string) {
  window.location.hash = hash;
}

function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

function getTelegramUser() {
  return getTelegramWebApp()?.initDataUnsafe?.user;
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash());
  const [lastSubmittedRequestId, setLastSubmittedRequestId] = useState<string | null>(null);
  const [lastRequestInfo, setLastRequestInfo] = useState<PublicBookingRequest | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [publicConfig, setPublicConfig] = useState<Pick<AppSnapshot, "services" | "windows" | "serviceOptions"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [adminAccessDenied, setAdminAccessDenied] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [uploading, setUploading] = useState({ hands: false, reference: false });
  const [uploadError, setUploadError] = useState({ hands: "", reference: "" });

  const clients = snapshot?.clients ?? [];
  const photos = snapshot?.photos ?? [];
  const requests = snapshot?.requests ?? [];
  const appointments = snapshot?.appointments ?? [];
  const windows = route.portal === "admin" ? (snapshot?.windows ?? []) : (publicConfig?.windows ?? timeWindows);
  const optionCatalog =
    route.portal === "admin"
      ? snapshot?.serviceOptions.length ? snapshot.serviceOptions : serviceOptions
      : publicConfig?.serviceOptions.length ? publicConfig.serviceOptions : serviceOptions;
  const services =
    route.portal === "admin"
      ? snapshot?.services.length ? snapshot.services : servicePresets
      : publicConfig?.services.length ? publicConfig.services : servicePresets;
  runtimeServiceCatalog = services;
  runtimeOptionCatalog = optionCatalog;
  const telegramWebApp = getTelegramWebApp();
  const isTelegramMiniApp = Boolean(telegramWebApp);
  const telegramInitData = telegramWebApp?.initData ?? "";
  const telegramUser = telegramWebApp?.initDataUnsafe?.user;
  const startParam = getStartParam();
  const locationPath = window.location.pathname;
  const locationHash = window.location.hash;

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
      const config = await api.getPublicBookingConfig();
      setPublicConfig(config);
      return config;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось загрузить публичные настройки записи");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshLastRequest = async (requestId: string) => {
    try {
      const info = await api.getPublicBookingRequest(requestId);
      setLastRequestInfo(info);
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
    if (route.portal !== "client" || !lastSubmittedRequestId) {
      return;
    }
    void refreshLastRequest(lastSubmittedRequestId);
  }, [lastSubmittedRequestId, route.portal]);

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
        optionIds: current.optionIds.filter((optionId) => services[0].options.includes(optionId)),
      };
    });
  }, [services]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.service) ?? services[0] ?? servicePresets[0],
    [form.service, services],
  );

  const selectedOptions = useMemo(
    () => optionCatalog.filter((option) => form.optionIds.includes(option.id)),
    [form.optionIds, optionCatalog],
  );

  const estimatedMinutes = useMemo(() => {
    const lengthBoost = { short: 0, medium: 15, long: 30, extra: 45 }[form.length];
    const optionsBoost = selectedOptions.reduce((sum, option) => sum + option.durationMinutes, 0);
    return selectedService.durationMinutes + lengthBoost + optionsBoost;
  }, [form.length, selectedOptions, selectedService.durationMinutes]);

  const estimatedPriceFrom = useMemo(() => {
    const optionsPrice = selectedOptions.reduce((sum, option) => sum + (option.priceFrom ?? 0), 0);
    return (selectedService.priceFrom ?? 0) + optionsPrice;
  }, [selectedOptions, selectedService.priceFrom]);

  const normalizedDesiredResult = useMemo(() => {
    const customText = form.desiredResult.trim();

    if (customText) {
      return customText;
    }

    const optionTitles = selectedOptions.map((option) => option.title);
    const summaryParts = [selectedService.title, lengthLabels[form.length]];

    if (optionTitles.length > 0) {
      summaryParts.push(optionTitles.join(", "));
    }

    return summaryParts.join(" • ");
  }, [form.desiredResult, form.length, selectedOptions, selectedService.title]);

  const submitRequest = async () => {
    const client: Client = {
      id: `CLI-${Date.now()}`,
      name: form.clientName.trim(),
      phone: form.phone.trim(),
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
      await api.createBookingRequest({ client, photos: newPhotos, request });
      setLastSubmittedRequestId(request.id);
      await refreshLastRequest(request.id);
      setForm(initialForm);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось отправить заявку");
    }
  };

  const confirmClientWindow = async (requestId: string) => {
    try {
      setApiError(null);
      await api.confirmPublicBookingRequest(requestId);
      await refreshLastRequest(requestId);
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

  const createServiceOption = async (option: ServiceOption) => {
    try {
      setApiError(null);
      await api.createServiceOption(option);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось добавить дополнение");
    }
  };

  const updateServiceOption = async (id: ServiceOptionKind, patch: Partial<ServiceOption>) => {
    try {
      setApiError(null);
      await api.updateServiceOption(id, patch);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось обновить дополнение");
    }
  };

  const deleteServiceOption = async (id: ServiceOptionKind) => {
    try {
      setApiError(null);
      await api.deleteServiceOption(id);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось удалить дополнение");
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

  const updateAppointmentStatus = async (appointmentId: string, status: AppSnapshot["appointments"][number]["status"]) => {
    try {
      setApiError(null);
      await api.updateAppointmentStatus(appointmentId, status);
      await refreshSnapshot();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось обновить статус записи");
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

  return (
    <main className="app-shell">
      {apiError && (
        <div className="panel error-panel">
          API недоступен или вернул ошибку: {apiError}
        </div>
      )}

      {isLoading && (
        <div className="panel notice-panel">
          Загружаю данные из PostgreSQL...
        </div>
      )}

      {route.portal === "client" && (
        <>
          <ClientHeader />
          {lastRequestInfo ? (
            <div className="panel notice-panel booking-celebration">
              <strong>Заявка {lastRequestInfo.request.id}</strong>
              <div>Статус: {statusLabels[lastRequestInfo.request.status]}</div>
              {lastRequestInfo.window ? (
                <div>Предложенное время: {lastRequestInfo.window.label}</div>
              ) : lastRequestInfo.request.customWindowText ? (
                <div>Ваше время: {lastRequestInfo.request.customWindowText}</div>
              ) : null}
              {lastRequestInfo.request.status === "waiting_client" && lastRequestInfo.window && (
                <button
                  className="primary-button"
                  onClick={() => confirmClientWindow(lastRequestInfo.request.id)}
                >
                  Подтвердить время
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => refreshLastRequest(lastRequestInfo.request.id)}
              >
                Обновить статус
              </button>
            </div>
          ) : (
            lastSubmittedRequestId && (
              <div className="panel notice-panel booking-celebration">
                Заявка {lastSubmittedRequestId} отправлена. Мастер проверит фото, время и детали.
              </div>
            )
          )}
          <ClientRequestForm
            form={form}
            estimatedMinutes={estimatedMinutes}
            estimatedPriceFrom={estimatedPriceFrom}
            requiresHandPhoto={form.isNewClient || selectedService.requiresHandPhoto}
            requiresReference={selectedService.requiresReference}
            services={services}
            serviceOptions={optionCatalog}
            selectedService={selectedService}
            availableWindows={windows.filter(
              (window) => window.status === "available" || window.status === "offered",
            )}
            setForm={setForm}
            submitRequest={submitRequest}
            uploadPhoto={uploadPhoto}
            uploading={uploading}
            uploadError={uploadError}
            isTelegramMiniApp={isTelegramMiniApp}
          />
        </>
      )}

      {route.portal === "survey" && (
        <SurveyPage appointmentId={route.appointmentId} />
      )}

      {route.portal === "admin" && (
        <>
            {adminAccessDenied ? (
              <div className="panel notice-panel">
                Админ-панель доступна только в Telegram Mini App для аккаунта мастера. Откройте приложение через кнопку в боте или проверьте, что ваш Telegram ID добавлен в список мастеров.
                <div className="notice-details">
                  <div>Telegram WebApp: {isTelegramMiniApp ? "yes" : "no"}</div>
                  <div>InitData length: {telegramInitData.length}</div>
                  <div>User ID: {telegramUser?.id ?? "n/a"}</div>
                  <div>Start param: {startParam || "n/a"}</div>
                  <div>Path: {locationPath || "/"}</div>
                  <div>Hash: {locationHash || "n/a"}</div>
                </div>
                <div className="action-row">
                  <button className="secondary-button" onClick={() => navigateTo("/")}>
                    Перейти к клиентской части
                  </button>
                </div>
            </div>
          ) : (
            <>
              <AdminHeader section={route.section} />
              {route.section === "requests" && (
                <MasterWorkspace
                  appointments={appointments}
                  clients={clients}
                  photos={photos}
                  requests={requests}
                  windows={windows}
                  confirmRequest={confirmRequest}
                  updateStatus={updateStatus}
                  updateWindow={updateWindow}
                  updateWindowStatus={updateWindowStatus}
                  moveAppointment={moveAppointment}
                  updateAppointmentStatus={updateAppointmentStatus}
                  addTimeWindow={addTimeWindow}
                />
              )}

              {route.section === "clients" && (
                <ClientsWorkspace
                  appointments={appointments}
                  clients={clients}
                  photos={photos}
                  requests={requests}
                  updateClientNotes={updateClientNotes}
                />
              )}

              {route.section === "settings" && (
                <SettingsWorkspaceV2
                  services={services}
                  serviceOptions={optionCatalog}
                  windows={windows}
                  addTimeWindow={addTimeWindow}
                  createServiceOption={createServiceOption}
                  updateServiceOption={updateServiceOption}
                  deleteServiceOption={deleteServiceOption}
                  createService={createService}
                  updateService={updateService}
                  deleteService={deleteService}
                  updateWindowStatus={updateWindowStatus}
                />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

function ClientHeader() {
  return (
    <section className="topbar client-hero">
      <div className="hero-copy">
        <p className="eyebrow">vvrnailss</p>
        <h1>Запись на ногти</h1>
        <p className="hero-text">
          Быстрая запись без переписки на десять сообщений: выберите услугу, приложите фото и получите аккуратное подтверждение от мастера.
        </p>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <img
          alt=""
          src={heroMainImage}
        />
      </div>
    </section>
  );
}

function AdminHeader({ section }: { section: AdminSection }) {
  return (
    <section className="topbar admin-topbar">
      <div>
        <p className="eyebrow">vvrnailss · админ</p>
        <h1>Рабочее место мастера</h1>
        <p className="hero-text">Заявки, расписание и клиенты в одном лёгком кабинете.</p>
      </div>
      <div className="mode-switch three" aria-label="Навигация админки">
        <button
          className={section === "requests" ? "active" : ""}
          onClick={() => navigateTo("/admin/requests")}
        >
          Заявки
        </button>
        <button
          className={section === "clients" ? "active" : ""}
          onClick={() => navigateTo("/admin/clients")}
        >
          Клиенты
        </button>
        <button
          className={section === "settings" ? "active" : ""}
          onClick={() => navigateTo("/admin/settings")}
        >
          Настройки
        </button>
      </div>
    </section>
  );
}

function ClientRequestForm({
  form,
  estimatedMinutes,
  estimatedPriceFrom,
  requiresHandPhoto,
  requiresReference,
  services,
  serviceOptions,
  selectedService,
  availableWindows,
  setForm,
  submitRequest,
  uploadPhoto,
  uploading,
  uploadError,
  isTelegramMiniApp,
}: {
  form: FormState;
  estimatedMinutes: number;
  estimatedPriceFrom: number;
  requiresHandPhoto: boolean;
  requiresReference: boolean;
  services: ServicePreset[];
  serviceOptions: ServiceOption[];
  selectedService: (typeof servicePresets)[number];
  availableWindows: TimeWindow[];
  setForm: (next: FormState) => void;
  submitRequest: () => void;
  uploadPhoto: (kind: PhotoAttachment["kind"], file: File) => Promise<PhotoAttachment | null>;
  uploading: { hands: boolean; reference: boolean };
  uploadError: { hands: string; reference: string };
  isTelegramMiniApp: boolean;
}) {
  const steps = useMemo(
    () =>
      [
        { id: "contacts", label: "Контакты" },
        { id: "service", label: "Услуга" },
        { id: "photos", label: "Фото" },
        { id: "time", label: "Время" },
        { id: "confirm", label: "Проверка" },
      ] satisfies { id: ClientFormStep; label: string }[],
    [],
  );
  const maxPhotoSizeBytes = 8 * 1024 * 1024;
  const [currentStep, setCurrentStep] = useState<ClientFormStep>("contacts");
  const [fileValidationError, setFileValidationError] = useState({ hands: "", reference: "" });
  const currentOptions = serviceOptions.filter((option) => selectedService.options.includes(option.id));
  const normalizedDesiredResult = useMemo(() => {
    const customText = form.desiredResult.trim();

    if (customText) {
      return customText;
    }

    const optionTitles = form.optionIds
      .map((optionId) => serviceOptions.find((option) => option.id === optionId)?.title)
      .filter((title): title is string => Boolean(title));
    const summaryParts = [selectedService.title, lengthLabels[form.length]];

    if (optionTitles.length > 0) {
      summaryParts.push(optionTitles.join(", "));
    }

    return summaryParts.join(" • ");
  }, [form.desiredResult, form.length, form.optionIds, selectedService.title, serviceOptions]);
  const needsCustomWindow = form.preferredWindowId === customWindowValue;
  const windowsByDate = useMemo(() => {
    const map = new Map<string, { dateKey: string; label: string; items: TimeWindow[] }>();

    availableWindows.forEach((window) => {
      const dateKey = window.startAt.split("T")[0];
      const current = map.get(dateKey) ?? {
        dateKey,
        label: formatDayLabel(window.startAt),
        items: [],
      };
      current.items.push(window);
      map.set(dateKey, current);
    });

    return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [availableWindows]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const stepIndex = steps.findIndex((step) => step.id === currentStep);
  const contactHandleRequired = form.contactChannel !== "phone";
  const phoneDigits = form.phone.replace(/\D/g, "");
  const validationMessages = {
    clientName: form.clientName.trim() ? "" : "Напишите, как к вам обращаться.",
    phone: phoneDigits.length >= 10 ? "" : "Оставьте, пожалуйста, номер телефона полностью, чтобы я могла связаться с вами.",
    contactHandle:
      !contactHandleRequired || form.contactHandle.trim()
        ? ""
        : "Если удобнее общаться не по телефону, оставьте здесь ваш ник или ссылку.",
    desiredResult:
      form.desiredResult.trim().length >= 10
        ? ""
        : "Расскажите, что хочется сделать: покрытие, дизайн, ремонт, снятие или другие детали.",
    handPhoto:
      !requiresHandPhoto || form.handPhoto
        ? ""
        : "Прикрепите фото рук, пожалуйста — так я смогу точнее всё оценить.",
    referencePhoto:
      !requiresReference || form.referencePhoto
        ? ""
        : "Если у вас есть референс, прикрепите его сюда — так я лучше пойму настроение и форму.",
    time:
      needsCustomWindow
        ? form.customWindowText.trim()
          ? ""
          : "Напишите, когда вам удобно — я постараюсь подобрать подходящее время."
        : form.preferredWindowId
          ? ""
          : "Выберите удобное окошко или вариант «Хочу другое время».",
  };
  const stepErrors: Record<ClientFormStep, string[]> = {
    contacts: [validationMessages.clientName, validationMessages.phone, validationMessages.contactHandle].filter(Boolean),
    service: [],
    photos: [
      validationMessages.handPhoto,
      validationMessages.referencePhoto,
      fileValidationError.hands,
      fileValidationError.reference,
      uploadError.hands,
      uploadError.reference,
    ].filter(Boolean),
    time: [validationMessages.time].filter(Boolean),
    confirm: [],
  };
  const requiredFilled = Boolean(
    form.clientName.trim() &&
    phoneDigits.length >= 10 &&
    (!contactHandleRequired || form.contactHandle.trim()) &&
    (needsCustomWindow ? form.customWindowText.trim() : form.preferredWindowId) &&
    (!requiresHandPhoto || form.handPhoto) &&
    (!requiresReference || form.referencePhoto) &&
    !fileValidationError.hands &&
    !fileValidationError.reference &&
    !uploadError.hands &&
    !uploadError.reference,
  );

  const goToStep = (step: ClientFormStep) => setCurrentStep(step);
  const nextStep = () => {
    if (stepErrors[currentStep].length > 0) {
      return;
    }

    setCurrentStep(steps[Math.min(stepIndex + 1, steps.length - 1)].id);
  };
  const previousStep = () => setCurrentStep(steps[Math.max(stepIndex - 1, 0)].id);

  useEffect(() => {
    if (!windowsByDate.length) {
      setSelectedDateKey(null);
      return;
    }

    if (!selectedDateKey || !windowsByDate.some((group) => group.dateKey === selectedDateKey)) {
      setSelectedDateKey(windowsByDate[0].dateKey);
    }
  }, [selectedDateKey, windowsByDate]);

  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;

    if (!backButton) {
      return;
    }

    const handleBack = () => {
      setCurrentStep((step) => {
        const index = steps.findIndex((item) => item.id === step);
        return steps[Math.max(index - 1, 0)].id;
      });
    };

    if (stepIndex > 0) {
      backButton.show();
      backButton.onClick(handleBack);
    } else {
      backButton.hide();
    }

    return () => {
      backButton.offClick(handleBack);
      if (stepIndex > 0) {
        backButton.hide();
      }
    };
  }, [stepIndex, steps]);

  const handlePhotoChange = (kind: PhotoAttachment["kind"], file?: File) => {
    const key = kind === "hands" ? "hands" : "reference";

    if (!file) {
      return;
    }

    if (file.type && !file.type.startsWith("image/")) {
      setFileValidationError((current) => ({ ...current, [key]: "Загрузите изображение: JPG, PNG или HEIC." }));
      return;
    }

    if (file.size > maxPhotoSizeBytes) {
      setFileValidationError((current) => ({ ...current, [key]: "Фото тяжелее 8 МБ. Выберите файл поменьше." }));
      return;
    }

    setFileValidationError((current) => ({ ...current, [key]: "" }));
    void uploadPhoto(kind, file);
  };

  const toggleOption = (id: ServiceOptionKind) => {
    setForm({
      ...form,
      optionIds: form.optionIds.includes(id)
        ? form.optionIds.filter((optionId) => optionId !== id)
        : [...form.optionIds, id],
    });
  };

  const chooseService = (service: ServiceKind) => {
    const nextService = services.find((item) => item.id === service)!;
    setForm({
      ...form,
      service,
      optionIds: form.optionIds.filter((optionId) => nextService.options.includes(optionId)),
    });
  };

  return (
    <section className="content-grid">
      <form className="panel request-form" onSubmit={(event) => event.preventDefault()}>
        <div className="section-title">
          <ClipboardList size={22} />
          <div>
            <h2>Заявка на запись</h2>
            <p>Заполните то, что мастер обычно уточняет в переписке.</p>
          </div>
        </div>

        <div className="form-steps" aria-label="Шаги заявки">
          {steps.map((step, index) => (
            <button
              className={`step-chip${step.id === currentStep ? " active" : ""}`}
              key={step.id}
              onClick={() => goToStep(step.id)}
              type="button"
            >
              <span>{index + 1}</span>
              {step.label}
            </button>
          ))}
        </div>

        {currentStep === "contacts" && (
          <div className="step-panel">
            <label>
              Имя
              <input
                aria-describedby="clientNameHint"
                value={form.clientName}
                onChange={(event) => setForm({ ...form, clientName: event.target.value })}
                  placeholder="Например, Елена"
              />
              {validationMessages.clientName && <small className="field-hint" id="clientNameHint">{validationMessages.clientName}</small>}
            </label>

            <label>
              Номер телефона
              <input
                aria-describedby="phoneHint"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+7 ..."
              />
              {validationMessages.phone && <small className="field-hint" id="phoneHint">{validationMessages.phone}</small>}
            </label>

            <div className="field-row">
              <label>
                Где удобнее общаться
                <select
                  value={form.contactChannel}
                  onChange={(event) =>
                    setForm({ ...form, contactChannel: event.target.value as ContactChannel })
                  }
                >
                  <option value="telegram">Telegram</option>
                  <option value="vk">VK</option>
                  <option value="phone">Телефон</option>
                </select>
              </label>
              <label>
                Ник или ссылка
                <input
                  aria-describedby="contactHandleHint"
                  value={form.contactHandle}
                  onChange={(event) => setForm({ ...form, contactHandle: event.target.value })}
                  placeholder={contactHandleRequired ? "@username или vk.com/..." : "Если захотите, можно оставить"}
                />
                {validationMessages.contactHandle && <small className="field-hint" id="contactHandleHint">{validationMessages.contactHandle}</small>}
              </label>
            </div>

            <label className="checkbox-line first-visit-toggle">
              <input
                type="checkbox"
                checked={form.isNewClient}
                onChange={(event) => setForm({ ...form, isNewClient: event.target.checked })}
              />
              <span className="checkbox-copy first-visit-copy">
                <strong>Я первый раз у мастера</strong>
                <small>Это поможет точнее оценить фото и подобрать комфортное время.</small>
              </span>
            </label>
          </div>
        )}

        {currentStep === "service" && (
          <div className="step-panel">
            <div className="service-picker" aria-label="Выбор услуги">
              {services.map((service) => (
                <button
                  className={`service-option-card${form.service === service.id ? " active" : ""}`}
                  key={service.id}
                  onClick={() => chooseService(service.id)}
                  type="button"
                >
                  <span>{service.requiresReference ? "с референсом" : "easy care"}</span>
                  <strong>{service.title}</strong>
                  <small>
                    {Math.floor(service.durationMinutes / 60)} ч {service.durationMinutes % 60} мин · от {(service.priceFrom ?? 0).toLocaleString("ru-RU")} ₽
                  </small>
                </button>
              ))}
            </div>

            <div className="field-row">
              <label>
                Длина
                <select
                  value={form.length}
                  onChange={(event) => setForm({ ...form, length: event.target.value as NailLength })}
                >
                  {Object.entries(lengthLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="option-list">
              <legend>Дополнительно</legend>
              {currentOptions.map((option) => (
                <label className="checkbox-line option-row" key={option.id}>
                  <input
                    type="checkbox"
                    checked={form.optionIds.includes(option.id)}
                    onChange={() => toggleOption(option.id)}
                  />
                  <span className="checkbox-copy">
                    <strong>{option.title}</strong>
                    <small>+{option.durationMinutes} мин · от {(option.priceFrom ?? 0).toLocaleString("ru-RU")} ₽</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <label>
              Что будем делать
              <textarea
                aria-describedby="desiredResultHint"
                value={form.desiredResult}
                onChange={(event) => setForm({ ...form, desiredResult: event.target.value })}
                placeholder="Наращивание, коррекция, на свои, дизайн, ремонт, снятие..."
              />
              {validationMessages.desiredResult && <small className="field-hint" id="desiredResultHint">{validationMessages.desiredResult}</small>}
            </label>
          </div>
        )}

        {currentStep === "photos" && (
          <div className="step-panel">
            {(uploading.hands || uploading.reference) && (
              <small className="field-hint">Загружаю фото...</small>
            )}

            <div className="field-row">
              <label>
                {requiresHandPhoto ? "Фото своих рук" : "Фото своих рук, если есть изменения"}
                <input
                  aria-describedby="handsHint"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handlePhotoChange("hands", event.target.files?.[0])}
                />
                {form.handPhoto && <small className="success-text">Загружено: {form.handPhoto.fileName}</small>}
                {(validationMessages.handPhoto || fileValidationError.hands || uploadError.hands) && (
                  <small className="field-hint" id="handsHint">
                    {validationMessages.handPhoto || fileValidationError.hands || uploadError.hands}
                  </small>
                )}
              </label>
              <label>
                {requiresReference ? "Фото референса" : "Фото референса, если нужно"}
                <input
                  aria-describedby="referenceHint"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handlePhotoChange("reference", event.target.files?.[0])}
                />
                {form.referencePhoto && <small className="success-text">Загружено: {form.referencePhoto.fileName}</small>}
                {(validationMessages.referencePhoto || fileValidationError.reference || uploadError.reference) && (
                  <small className="field-hint" id="referenceHint">
                    {validationMessages.referencePhoto || fileValidationError.reference || uploadError.reference}
                  </small>
                )}
              </label>
            </div>
          </div>
        )}

        {currentStep === "time" && (
          <div className="step-panel">
            <div className="booking-calendar" aria-describedby="timeHint">
              <div className="booking-calendar-header">
                <span>Выберите удобное окошко</span>
              </div>

              {windowsByDate.length === 0 ? (
                <div className="empty-state">Свободных окошек пока нет. Можно оставить своё пожелание по времени.</div>
              ) : (
                <>
                  <div className="booking-day-pills" role="tablist" aria-label="Дни для записи">
                    {windowsByDate.map((group) => (
                      <button
                        className={`booking-day-pill${selectedDateKey === group.dateKey ? " active" : ""}`}
                        key={group.dateKey}
                        onClick={() => setSelectedDateKey(group.dateKey)}
                        type="button"
                      >
                        <span>{group.label}</span>
                        <small>{group.items.length} слота</small>
                      </button>
                    ))}
                  </div>

                  <div className="booking-date-groups">
                    {windowsByDate
                      .filter((group) => group.dateKey === selectedDateKey)
                      .map((group) => (
                        <section className="booking-date-group" key={group.dateKey}>
                          <strong>{group.label}</strong>
                          <div className="booking-slot-grid">
                            {group.items.map((window, index) => {
                              const isActive = form.preferredWindowId === window.id;
                              const slotMeta =
                                index === 0 ? "раннее" : index === group.items.length - 1 ? "вечернее" : "популярное";

                              return (
                                <button
                                  className={`booking-slot-button${isActive ? " active" : ""}`}
                                  key={window.id}
                                  onClick={() =>
                                    setForm({
                                      ...form,
                                      preferredWindowId: window.id,
                                      customWindowText: "",
                                    })
                                  }
                                  type="button"
                                >
                                  <span>{formatTimeRange(window.startAt, window.endAt)}</span>
                                  <small>{slotMeta}</small>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                  </div>
                </>
              )}

              <button
                className={`calendar-custom-button${needsCustomWindow ? " active" : ""}`}
                onClick={() =>
                  setForm({
                    ...form,
                    preferredWindowId: customWindowValue,
                  })
                }
                type="button"
              >
                Хочу другое время
              </button>
              {validationMessages.time && <small className="field-hint" id="timeHint">{validationMessages.time}</small>}
            </div>

            {needsCustomWindow && (
              <label>
                Когда вам удобно
                <input
                  value={form.customWindowText}
                  onChange={(event) => setForm({ ...form, customWindowText: event.target.value })}
                  placeholder="Например: после 18:00 в будни"
                />
              </label>
            )}

            <label>
              Комментарий
              <textarea
                value={form.comment}
                onChange={(event) => setForm({ ...form, comment: event.target.value })}
                placeholder="Любые детали: сколы, аллергии, пожелания по цвету..."
              />
            </label>
          </div>
        )}

        {currentStep === "confirm" && (
          <div className="step-panel confirmation-list">
            <Info label="Имя" value={form.clientName || "Не указано"} />
            <Info label="Телефон" value={form.phone || "Не указан"} />
            <Info label="Связь" value={`${contactLabels[form.contactChannel]} ${form.contactHandle}`.trim()} />
            <Info label="Процедура" value={selectedService.title} />
            <Info label="Допы" value={form.optionIds.map(optionTitle).join(", ") || "Без допов"} />
            <Info label="Описание" value={form.desiredResult || normalizedDesiredResult} />
            <Info label="Фото рук" value={form.handPhoto?.fileName ?? "Не приложено"} />
            <Info label="Референс" value={form.referencePhoto?.fileName ?? "Не приложен"} />
            <Info
              label="Время"
              value={
                needsCustomWindow
                  ? form.customWindowText || "Не указано"
                  : availableWindows.find((window) => window.id === form.preferredWindowId)?.label ?? "Не выбрано"
              }
            />
          </div>
        )}

        <div className="form-navigation">
          <button className="secondary-button" disabled={stepIndex === 0} onClick={previousStep} type="button">
            Назад
          </button>
          {currentStep === "confirm" ? (
            <button className="primary-button" disabled={!requiredFilled} onClick={submitRequest} type="button">
              Отправить заявку <Send size={18} />
            </button>
          ) : (
            <button className="primary-button" disabled={stepErrors[currentStep].length > 0} onClick={nextStep} type="button">
              Продолжить <ChevronRight size={18} />
            </button>
          )}
        </div>
      </form>

      <aside className="panel summary-panel">
        <Sparkles size={28} />
        <h2>{selectedService.title}</h2>
        <p>
          Примерная длительность: <strong>{Math.floor(estimatedMinutes / 60)} ч {estimatedMinutes % 60} мин</strong>
        </p>
        <p>
          Примерная стоимость: <strong>от {estimatedPriceFrom.toLocaleString("ru-RU")} ₽</strong>
        </p>
        <p>Финальные время и стоимость мастер подтвердит после просмотра заявки.</p>
        <div className="summary-progress">
          <span>Шаг {stepIndex + 1} из {steps.length}</span>
          <strong>{steps[stepIndex].label}</strong>
        </div>
        {!requiredFilled && (
          <span className="hint">
            Мне понадобятся имя, телефон, описание и удобное время
            {requiresHandPhoto && requiresReference
              ? ", а ещё фото рук и референс."
              : requiresHandPhoto
                ? ", а ещё фото рук."
                : requiresReference
                  ? ", а ещё референс."
                  : "."}
          </span>
        )}
      </aside>
    </section>
  );
}

function MasterWorkspace({
  appointments,
  clients,
  photos,
  requests,
  windows,
  confirmRequest,
  updateStatus,
  updateWindow,
  updateWindowStatus,
  moveAppointment,
  updateAppointmentStatus,
  addTimeWindow,
}: {
  appointments: AppSnapshot["appointments"];
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  windows: TimeWindow[];
  confirmRequest: (id: string) => void;
  updateStatus: (id: string, status: RequestStatus) => void;
  updateWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) => void;
  updateWindowStatus: (id: string, status: TimeWindowStatus) => void;
  moveAppointment: (appointmentId: string, windowId: string) => void;
  updateAppointmentStatus: (appointmentId: string, status: AppSnapshot["appointments"][number]["status"]) => void;
  addTimeWindow: (window: Omit<TimeWindow, "id" | "label" | "status">) => void;
}) {
  const [dragAppointmentId, setDragAppointmentId] = useState<string | null>(null);
  const [dragOverWindowId, setDragOverWindowId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ appointmentId: string; windowId: string } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; label: string } | null>(null);
  const [windowForm, setWindowForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    start: "11:00",
    end: "14:00",
  });

  const windowsByDate = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: TimeWindow[] }>();
    windows.forEach((window) => {
      const key = window.startAt.split("T")[0];
      const label = formatDayLabel(window.startAt);
      const entry = map.get(key) ?? { key, label, items: [] };
      entry.items.push(window);
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [windows]);

  const findAppointmentForWindow = (window: TimeWindow) =>
    appointments.find(
      (appointment) =>
        appointment.status === "scheduled" &&
        appointment.startAt === window.startAt &&
        appointment.endAt === window.endAt,
    );

  const scheduleMove = (appointmentId: string, windowId: string) => {
    setPendingMove({ appointmentId, windowId });
  };

  const executeMove = async () => {
    if (!pendingMove) {
      return;
    }
    await moveAppointment(pendingMove.appointmentId, pendingMove.windowId);
    setPendingMove(null);
  };

  const autoScroll = (clientY: number) => {
    const threshold = 80;
    const speed = 12;
    if (clientY < threshold) {
      window.scrollBy(0, -speed);
      return;
    }
    if (window.innerHeight - clientY < threshold) {
      window.scrollBy(0, speed);
    }
  };

  const pendingDetails = pendingMove
    ? (() => {
        const appointment = appointments.find((item) => item.id === pendingMove.appointmentId);
        const targetWindow = windows.find((item) => item.id === pendingMove.windowId);
        if (!appointment || !targetWindow) {
          return null;
        }
        const oldWindow = windows.find(
          (item) => item.startAt === appointment.startAt && item.endAt === appointment.endAt,
        );
        return {
          client: clients.find((item) => item.id === appointment.clientId),
          from: oldWindow,
          to: targetWindow,
        };
      })()
    : null;
  const newRequestsCount = requests.filter((request) => request.status === "new").length;
  const scheduledCount = appointments.filter((appointment) => appointment.status === "scheduled").length;
  const availableWindowsCount = windows.filter((window) => window.status === "available").length;
  const activeClientsCount = clients.length;

  return (
    <>
      <section className="dashboard-grid" aria-label="Показатели мастера">
        <div className="stat-card featured">
          <span>Сегодня в фокусе</span>
          <strong>{newRequestsCount}</strong>
          <small>новых заявок ждут решения</small>
        </div>
        <div className="stat-card">
          <span>Записи</span>
          <strong>{scheduledCount}</strong>
          <small>активных визитов</small>
        </div>
        <div className="stat-card">
          <span>Окошки</span>
          <strong>{availableWindowsCount}</strong>
          <small>доступно для записи</small>
        </div>
        <div className="stat-card">
          <span>Клиенты</span>
          <strong>{activeClientsCount}</strong>
          <small>в базе мастера</small>
        </div>
      </section>

      <section className="master-layout">
        <div className="requests-stack">
        <div className="section-title">
          <UserRound size={22} />
          <div>
            <h2>Входящие заявки</h2>
            <p>Клиент заполняет детали, мастер принимает решение.</p>
          </div>
        </div>
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            client={clients.find((client) => client.id === request.clientId)}
            photos={photos.filter((photo) => request.photoIds.includes(photo.id))}
            request={request}
            windows={windows}
            confirmRequest={confirmRequest}
            updateStatus={updateStatus}
            updateWindow={updateWindow}
          />
        ))}
        </div>

        <aside className="panel calendar-panel">
        <div className="section-title">
          <CalendarClock size={22} />
          <div>
            <h2>Календарь</h2>
            <p>Только подтвержденные заявки становятся записями.</p>
          </div>
        </div>
        <div className="calendar-hint">Перетащи запись на свободное окно.</div>

        <div className="calendar-toolbar">
          <label>
            Дата
            <input
              type="date"
              value={windowForm.date}
              onChange={(event) => setWindowForm({ ...windowForm, date: event.target.value })}
            />
          </label>
          <label>
            Начало
            <input
              type="time"
              value={windowForm.start}
              onChange={(event) => setWindowForm({ ...windowForm, start: event.target.value })}
            />
          </label>
          <label>
            Конец
            <input
              type="time"
              value={windowForm.end}
              onChange={(event) => setWindowForm({ ...windowForm, end: event.target.value })}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => {
              if (!windowForm.date || !windowForm.start || !windowForm.end) {
                return;
              }
              addTimeWindow({
                startAt: `${windowForm.date}T${windowForm.start}:00+03:00`,
                endAt: `${windowForm.date}T${windowForm.end}:00+03:00`,
              });
            }}
          >
            Создать окно
          </button>
        </div>

        <div className="calendar-board">
          {windowsByDate.length === 0 ? (
            <div className="empty-state">Нет окошек в календаре.</div>
          ) : (
            windowsByDate.map((day) => (
              <section key={day.key} className="calendar-day">
                <h3>{day.label}</h3>
                <div className="calendar-grid">
                  {day.items.map((window) => {
                    const appointment = findAppointmentForWindow(window);
                    const client = appointment
                      ? clients.find((item) => item.id === appointment.clientId)
                      : null;
                    const isFutureWindow = new Date(window.startAt).getTime() >= Date.now();
                    const canDropHere = Boolean(dragAppointmentId) && window.status === "available" && isFutureWindow;
                    const isDragOver = dragOverWindowId === window.id && canDropHere;
                    return (
                      <article
                        key={window.id}
                        className={`calendar-slot ${window.status}${canDropHere ? " droppable" : ""}${isDragOver ? " drag-over" : ""}`}
                        draggable={Boolean(appointment)}
                        onDragStart={() => {
                          if (appointment) {
                            setDragAppointmentId(appointment.id);
                          }
                        }}
                        onDragEnd={() => {
                          setDragAppointmentId(null);
                          setDragOverWindowId(null);
                        }}
                        onDragOver={(event) => {
                          if (dragAppointmentId) {
                            autoScroll(event.clientY);
                          }
                          if (!canDropHere) {
                            return;
                          }
                          event.preventDefault();
                          setDragOverWindowId(window.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverWindowId === window.id) {
                            setDragOverWindowId(null);
                          }
                        }}
                        onDrop={() => {
                          if (canDropHere && dragAppointmentId) {
                            scheduleMove(dragAppointmentId, window.id);
                          }
                          setDragAppointmentId(null);
                          setDragOverWindowId(null);
                        }}
                        onTouchStart={(event) => {
                          if (!appointment) {
                            return;
                          }
                          const touch = event.touches[0];
                          setDragAppointmentId(appointment.id);
                          setDragPreview({
                            x: touch.clientX,
                            y: touch.clientY,
                            label: `${client?.name ?? "Клиент"} · ${formatTimeRange(window.startAt, window.endAt)}`,
                          });
                        }}
                        onTouchMove={(event) => {
                          if (!dragAppointmentId) {
                            return;
                          }
                          const touch = event.touches[0];
                          autoScroll(touch.clientY);
                          setDragPreview((current) =>
                            current ? { ...current, x: touch.clientX, y: touch.clientY } : null,
                          );
                          const target = document.elementFromPoint(touch.clientX, touch.clientY);
                          const slot = target?.closest("[data-window-id]") as HTMLElement | null;
                          setDragOverWindowId(slot?.dataset.windowId ?? null);
                          event.preventDefault();
                        }}
                        onTouchEnd={() => {
                          if (dragAppointmentId && dragOverWindowId) {
                            const targetWindow = windows.find((item) => item.id === dragOverWindowId);
                            if (targetWindow?.status === "available") {
                              scheduleMove(dragAppointmentId, dragOverWindowId);
                            }
                          }
                          setDragAppointmentId(null);
                          setDragOverWindowId(null);
                          setDragPreview(null);
                        }}
                        data-window-id={window.id}
                      >
                        <div className="slot-header">
                          <strong>{formatTimeRange(window.startAt, window.endAt)}</strong>
                          <span>{windowStatusLabel(window.status)}</span>
                        </div>
                        {appointment ? (
                          <div className="slot-body">
                            <div>{client?.name ?? "Клиент"}</div>
                            <small>{serviceTitle(appointment.service)} · {appointment.durationMinutes} мин</small>
                          </div>
                        ) : (
                          <div className="slot-body">Свободно</div>
                        )}
                        <div className="slot-actions">
                          {appointment ? (
                            <div className="slot-action-stack">
                              <span className="slot-hint">Перетащи, чтобы перенести.</span>
                              <button
                                className="danger-button"
                                onClick={() => {
                                  if (globalThis.confirm("Отменить запись?")) {
                                    updateAppointmentStatus(appointment.id, "cancelled");
                                  }
                                }}
                              >
                                Отменить
                              </button>
                            </div>
                          ) : window.status === "available" ? (
                            <button
                              className="secondary-button"
                              onClick={() => updateWindowStatus(window.id, "blocked")}
                            >
                              Закрыть
                            </button>
                          ) : window.status === "blocked" ? (
                            <button
                              className="secondary-button"
                              onClick={() => updateWindowStatus(window.id, "available")}
                            >
                              Открыть
                            </button>
                          ) : (
                            <button className="secondary-button" disabled>
                              Недоступно
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
        {pendingMove && (
          <div className="panel notice-panel">
            Перенести запись в выбранное окно?
            {pendingDetails && (
              <div className="move-details">
                <div>
                  Клиент: {pendingDetails.client?.name ?? "Клиент"}
                </div>
                {pendingDetails.from && (
                  <div>
                    Было: {formatDayLabel(pendingDetails.from.startAt)} {formatTimeRange(pendingDetails.from.startAt, pendingDetails.from.endAt)}
                  </div>
                )}
                <div>
                  Станет: {formatDayLabel(pendingDetails.to.startAt)} {formatTimeRange(pendingDetails.to.startAt, pendingDetails.to.endAt)}
                </div>
              </div>
            )}
            <div className="action-row">
              <button className="primary-button" onClick={executeMove}>
                Подтвердить
              </button>
              <button className="secondary-button" onClick={() => setPendingMove(null)}>
                Отменить
              </button>
            </div>
          </div>
        )}
        {dragPreview && (
          <div
            className="drag-preview"
            style={{ left: dragPreview.x + 10, top: dragPreview.y + 10 }}
          >
            {dragPreview.label}
          </div>
        )}
        </aside>
      </section>
    </>
  );
}

function SurveyPage({ appointmentId }: { appointmentId: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "submitted" | "error">("loading");

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    api
      .getPublicAppointment(appointmentId)
      .then((data) => {
        if (!mounted) {
          return;
        }
        setAppointment(data);
        if (data.surveyRating) {
          setStatus("submitted");
          setRating(data.surveyRating);
          setText(data.surveyText ?? "");
        } else {
          setStatus("ready");
        }
      })
      .catch(() => {
        if (mounted) {
          setStatus("error");
        }
      });
    return () => {
      mounted = false;
    };
  }, [appointmentId]);

  const submitSurvey = async () => {
    if (!rating) {
      return;
    }
    try {
      await api.submitAppointmentSurvey(appointmentId, {
        rating,
        text: text.trim() ? text.trim() : undefined,
      });
      setStatus("submitted");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="survey-layout">
      <div className="panel survey-panel">
        <h2>Оцените визит</h2>
        {status === "loading" && <p>Загружаю данные записи...</p>}
        {status === "error" && (
          <p>Не удалось открыть форму. Попробуйте позже или напишите мастеру.</p>
        )}
        {status !== "loading" && status !== "error" && appointment && (
          <>
            <p>
              Запись: {formatDateTime(appointment.startAt)}
            </p>
            {status === "submitted" ? (
              <p>Спасибо! Отзыв уже получен.</p>
            ) : (
              <>
                <div className="rating-row">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      className={`rating-button${rating === value ? " active" : ""}`}
                      onClick={() => setRating(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <label>
                  Отзыв
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Напишите пару слов о визите"
                  />
                </label>
                <button className="primary-button" disabled={!rating} onClick={submitSurvey}>
                  Отправить отзыв
                </button>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ClientsWorkspace({
  appointments,
  clients,
  photos,
  requests,
  updateClientNotes,
}: {
  appointments: AppSnapshot["appointments"];
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  updateClientNotes: (id: string, notes: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("all");
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru-RU");

  const clientRows = useMemo(
    () =>
      clients.map((client) => {
        const clientRequests = requests.filter((request) => request.clientId === client.id);
        const clientAppointments = appointments.filter((appointment) => appointment.clientId === client.id);
        const clientPhotoIds = new Set(clientRequests.flatMap((request) => request.photoIds));
        const clientPhotos = photos.filter((photo) => clientPhotoIds.has(photo.id));
        const latestRequest = clientRequests[0];

        return { client, clientRequests, clientAppointments, clientPhotos, latestRequest };
      }),
    [appointments, clients, photos, requests],
  );

  const filteredClientRows = useMemo(
    () =>
      clientRows.filter(({ client, clientRequests, latestRequest }) => {
        const matchesStatus = statusFilter === "all" || latestRequest?.status === statusFilter;
        const searchableText = [
          client.name,
          client.phone,
          client.contactHandle,
          client.notes,
          client.id,
          contactLabels[client.preferredContactChannel],
          ...clientRequests.flatMap((request) => [
            request.id,
            serviceTitle(request.service),
            statusLabels[request.status],
            request.desiredResult,
            request.comment,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru-RU");

        return matchesStatus && (!normalizedQuery || searchableText.includes(normalizedQuery));
      }),
    [clientRows, normalizedQuery, statusFilter],
  );

  const hasActiveFilters = Boolean(normalizedQuery) || statusFilter !== "all";

  return (
    <section className="clients-layout">
      <div className="section-title">
        <UserRound size={22} />
        <div>
          <h2>Клиентская база</h2>
          <p>Контакты, история заявок и заметки мастера собраны в одном месте.</p>
        </div>
      </div>

      <div className="panel client-filters">
        <label>
          Найти клиента
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Имя, телефон, ник, услуга или заметка"
            type="search"
          />
        </label>
        <label>
          Последний статус
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ClientStatusFilter)}
          >
            <option value="all">Все клиенты</option>
            {Object.entries(statusLabels).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-summary">
          <span>
            Найдено: {filteredClientRows.length} из {clientRows.length}
          </span>
          <button
            className="secondary-button"
            disabled={!hasActiveFilters}
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
          >
            Сбросить
          </button>
        </div>
      </div>

      <div className="client-card-grid">
        {filteredClientRows.length === 0 ? (
          <div className="empty-state">По этим фильтрам клиентов не найдено.</div>
        ) : (
          filteredClientRows.map(({ client, clientRequests, clientAppointments, clientPhotos, latestRequest }) => {
            return (
              <article className="panel client-card" key={client.id}>
              <div className="card-header">
                <div>
                  <span className="status">{client.firstVisit ? "Первый визит" : "Постоянный клиент"}</span>
                  <h3>{client.name}</h3>
                </div>
                <span className="request-id">{client.id}</span>
              </div>

              <div className="info-grid">
                <Info icon={<Phone size={16} />} label="Телефон" value={client.phone} />
                <Info
                  icon={<MessageCircle size={16} />}
                  label="Связь"
                  value={`${contactLabels[client.preferredContactChannel]} ${client.contactHandle}`}
                />
                <Info label="Заявки" value={String(clientRequests.length)} />
                <Info label="Записи" value={String(clientAppointments.length)} />
                <Info label="Последняя услуга" value={latestRequest ? serviceTitle(latestRequest.service) : "Еще нет"} />
                <Info
                  label="Последний статус"
                  value={latestRequest ? statusLabels[latestRequest.status] : "Еще нет"}
                />
              </div>

              <ClientNotesEditor client={client} updateClientNotes={updateClientNotes} />

              <div className="client-history">
                <strong><History size={16} /> История</strong>
                {clientRequests.length === 0 ? (
                  <p>Заявок пока нет.</p>
                ) : (
                  clientRequests.map((request) => (
                    <div className="history-item" key={request.id}>
                      <span>{serviceTitle(request.service)} · {statusLabels[request.status]}</span>
                      <small>{formatDateTime(request.createdAt)} · {request.estimatedMinutes} мин</small>
                    </div>
                  ))
                )}
              </div>

              <div className="client-history">
                <strong>Фото</strong>
                {clientPhotos.length === 0 ? (
                  <p>Фото пока не приложены.</p>
                ) : (
                  <div className="photo-list">
                    {clientPhotos.map((photo) => (
                      <span key={photo.id}>{photo.kind === "hands" ? "Руки" : "Референс"}: {photo.fileName}</span>
                    ))}
                  </div>
                )}
              </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ClientNotesEditor({
  client,
  updateClientNotes,
}: {
  client: Client;
  updateClientNotes: (id: string, notes: string) => void;
}) {
  const [notes, setNotes] = useState(client.notes ?? "");

  useEffect(() => {
    setNotes(client.notes ?? "");
  }, [client.notes]);

  return (
    <label>
      Заметка мастера
      <textarea
        value={notes}
        onBlur={() => updateClientNotes(client.id, notes)}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Аллергии, предпочтения, опоздания, любимая форма..."
      />
    </label>
  );
}

function SettingsWorkspace({
  services,
  windows,
  addTimeWindow,
  updateService,
  updateWindowStatus,
}: {
  services: ServicePreset[];
  windows: TimeWindow[];
  addTimeWindow: (window: Omit<TimeWindow, "id" | "label" | "status">) => void;
  updateService: (id: ServiceKind, patch: Partial<ServicePreset>) => void;
  updateWindowStatus: (id: string, status: TimeWindowStatus) => void;
}) {
  const [windowForm, setWindowForm] = useState({
    date: "2026-04-18",
    start: "11:00",
    end: "14:00",
  });

  const submitWindow = () => {
    if (!windowForm.date || !windowForm.start || !windowForm.end) {
      return;
    }

    addTimeWindow({
      startAt: `${windowForm.date}T${windowForm.start}:00+03:00`,
      endAt: `${windowForm.date}T${windowForm.end}:00+03:00`,
    });
  };

  return (
    <section className="settings-layout">
      <div className="panel settings-panel">
        <div className="section-title">
          <Settings size={22} />
          <div>
            <h2>Процедуры</h2>
            <p>Мастер задает длительность, цену и обязательные фото.</p>
          </div>
        </div>

        <div className="settings-list">
          {services.map((service) => (
            <article className="settings-item" key={service.id}>
              <h3>{service.title}</h3>
              <div className="field-row">
                <label>
                  Длительность, мин
                  <input
                    type="number"
                    min="0"
                    value={service.durationMinutes}
                    onChange={(event) =>
                      updateService(service.id, {
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Цена от, ₽
                  <input
                    type="number"
                    min="0"
                    value={service.priceFrom ?? 0}
                    onChange={(event) =>
                      updateService(service.id, {
                        priceFrom: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="settings-flags">
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={service.requiresHandPhoto}
                    onChange={(event) =>
                      updateService(service.id, { requiresHandPhoto: event.target.checked })
                    }
                  />
                  <span className="checkbox-copy">
                    <strong>Обязательно фото рук</strong>
                    <small>Я заранее увижу состояние ногтей и смогу точнее подтвердить запись.</small>
                  </span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={service.requiresReference}
                    onChange={(event) =>
                      updateService(service.id, { requiresReference: event.target.checked })
                    }
                  />
                  <span className="checkbox-copy">
                    <strong>Обязательно фото референса</strong>
                    <small>Так проще понять желаемую форму, длину и настроение дизайна.</small>
                  </span>
                </label>
              </div>
              <p className="settings-meta">
                Допы: {service.options.map(optionTitle).join(", ") || "не настроены"}
              </p>
            </article>
          ))}
        </div>
      </div>

      <aside className="panel settings-panel">
        <div className="section-title">
          <CalendarClock size={22} />
          <div>
            <h2>Окошки</h2>
            <p>Можно добавить свободное окно или закрыть его вручную.</p>
          </div>
        </div>

        <div className="window-form">
          <label>
            Дата
            <input
              type="date"
              value={windowForm.date}
              onChange={(event) => setWindowForm({ ...windowForm, date: event.target.value })}
            />
          </label>
          <div className="field-row">
            <label>
              Начало
              <input
                type="time"
                value={windowForm.start}
                onChange={(event) => setWindowForm({ ...windowForm, start: event.target.value })}
              />
            </label>
            <label>
              Конец
              <input
                type="time"
                value={windowForm.end}
                onChange={(event) => setWindowForm({ ...windowForm, end: event.target.value })}
              />
            </label>
          </div>
          <button className="primary-button" onClick={submitWindow}>
            <Plus size={17} /> Добавить окошко
          </button>
        </div>

        <div className="window-list">
          {windows.map((window) => (
            <div className="window-item" key={window.id}>
              <div>
                <strong>{window.label}</strong>
                <span>{windowStatusLabel(window.status)}</span>
              </div>
              {window.status === "reserved" ? (
                <button className="secondary-button" disabled>
                  Занято
                </button>
              ) : window.status === "blocked" ? (
                <button className="secondary-button" onClick={() => updateWindowStatus(window.id, "available")}>
                  Открыть
                </button>
              ) : (
                <button className="danger-button" onClick={() => updateWindowStatus(window.id, "blocked")}>
                  Закрыть
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function SettingsWorkspaceV2({
  services,
  serviceOptions,
  windows,
  addTimeWindow,
  createServiceOption,
  updateServiceOption,
  deleteServiceOption,
  createService,
  updateService,
  deleteService,
  updateWindowStatus,
}: {
  services: ServicePreset[];
  serviceOptions: ServiceOption[];
  windows: TimeWindow[];
  addTimeWindow: (window: Omit<TimeWindow, "id" | "label" | "status">) => void;
  createServiceOption: (option: ServiceOption) => void;
  updateServiceOption: (id: ServiceOptionKind, patch: Partial<ServiceOption>) => void;
  deleteServiceOption: (id: ServiceOptionKind) => void;
  createService: (service: ServicePreset) => void;
  updateService: (id: ServiceKind, patch: Partial<ServicePreset>) => void;
  deleteService: (id: ServiceKind) => void;
  updateWindowStatus: (id: string, status: TimeWindowStatus) => void;
}) {
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, ServiceEditorState>>({});
  const [optionDrafts, setOptionDrafts] = useState<Record<string, OptionEditorState>>({});
  const [createForm, setCreateForm] = useState<ServiceEditorState>({
    title: "",
    durationMinutes: "120",
    priceFrom: "",
    requiresHandPhoto: false,
    requiresReference: true,
    options: [],
  });
  const [createOptionForm, setCreateOptionForm] = useState<OptionEditorState>({
    title: "",
    durationMinutes: "20",
    priceFrom: "",
  });
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [windowForm, setWindowForm] = useState({
    date: "2026-04-18",
    start: "11:00",
    end: "14:00",
  });

  useEffect(() => {
    setServiceDrafts(
      Object.fromEntries(services.map((service) => [service.id, toServiceEditorState(service)])),
    );
  }, [services]);

  useEffect(() => {
    setOptionDrafts(
      Object.fromEntries(serviceOptions.map((option) => [option.id, toOptionEditorState(option)])),
    );
  }, [serviceOptions]);

  const updateDraft = (serviceId: string, patch: Partial<ServiceEditorState>) => {
    const service = services.find((item) => item.id === serviceId);

    if (!service) {
      return;
    }

    setServiceDrafts((current) => ({
      ...current,
      [serviceId]: {
        ...(current[serviceId] ?? toServiceEditorState(service)),
        ...patch,
      },
    }));
  };

  const toggleServiceOption = (
    target: "draft" | "create",
    optionId: ServiceOptionKind,
    serviceId?: string,
  ) => {
    if (target === "create") {
      setCreateForm((current) => ({
        ...current,
        options: current.options.includes(optionId)
          ? current.options.filter((item) => item !== optionId)
          : [...current.options, optionId],
      }));
      return;
    }

    if (!serviceId) {
      return;
    }

    const currentOptions = serviceDrafts[serviceId]?.options ?? [];
    updateDraft(serviceId, {
      options: currentOptions.includes(optionId)
        ? currentOptions.filter((item) => item !== optionId)
        : [...currentOptions, optionId],
    });
  };

  const updateOptionDraft = (optionId: string, patch: Partial<OptionEditorState>) => {
    const option = serviceOptions.find((item) => item.id === optionId);

    if (!option) {
      return;
    }

    setOptionDrafts((current) => ({
      ...current,
      [optionId]: {
        ...(current[optionId] ?? toOptionEditorState(option)),
        ...patch,
      },
    }));
  };

  const submitWindow = () => {
    if (!windowForm.date || !windowForm.start || !windowForm.end) {
      return;
    }

    addTimeWindow({
      startAt: `${windowForm.date}T${windowForm.start}:00+03:00`,
      endAt: `${windowForm.date}T${windowForm.end}:00+03:00`,
    });
  };

  const submitCreateService = () => {
    const parsed = parseServiceEditor(
      createForm,
      makeServiceId(createForm.title, services.map((service) => service.id)),
    );

    if (!parsed) {
      setServiceError("Заполните название и длительность, чтобы услуга сохранилась аккуратно.");
      return;
    }

    setServiceError(null);
    createService(parsed);
    setCreateForm({
      title: "",
      durationMinutes: "120",
      priceFrom: "",
      requiresHandPhoto: false,
      requiresReference: true,
      options: [],
    });
  };

  const saveService = (serviceId: ServiceKind) => {
    const parsed = parseServiceEditor(serviceDrafts[serviceId], serviceId);

    if (!parsed) {
      setServiceError("У услуги должны быть название и корректная длительность.");
      return;
    }

    setServiceError(null);
    updateService(serviceId, parsed);
  };

  const resetService = (service: ServicePreset) => {
    setServiceDrafts((current) => ({
      ...current,
      [service.id]: toServiceEditorState(service),
    }));
  };

  const removeService = (serviceId: ServiceKind) => {
    if (services.length <= 1) {
      setServiceError("Нужна хотя бы одна услуга, чтобы онлайн-запись продолжала работать.");
      return;
    }

    setServiceError(null);
    deleteService(serviceId);
  };

  const submitCreateOption = () => {
    const parsed = parseOptionEditor(
      createOptionForm,
      makeServiceId(createOptionForm.title, serviceOptions.map((option) => option.id)),
    );

    if (!parsed) {
      setOptionError("У дополнения должны быть название и корректная длительность.");
      return;
    }

    setOptionError(null);
    createServiceOption(parsed);
    setCreateOptionForm({
      title: "",
      durationMinutes: "20",
      priceFrom: "",
    });
  };

  const saveOption = (optionId: ServiceOptionKind) => {
    const parsed = parseOptionEditor(optionDrafts[optionId], optionId);

    if (!parsed) {
      setOptionError("Не получилось сохранить дополнение: проверьте название и цифры.");
      return;
    }

    setOptionError(null);
    updateServiceOption(optionId, parsed);
  };

  const resetOption = (option: ServiceOption) => {
    setOptionDrafts((current) => ({
      ...current,
      [option.id]: toOptionEditorState(option),
    }));
  };

  const removeOption = (optionId: ServiceOptionKind) => {
    setOptionError(null);
    deleteServiceOption(optionId);
  };

  return (
    <section className="settings-layout">
      <div className="panel settings-panel">
        <div className="section-title">
          <Settings size={22} />
          <div>
            <h2>Процедуры</h2>
            <p>Здесь мастер полностью собирает каталог услуг: названия, цены, длительность, обязательные фото и допы.</p>
          </div>
        </div>

        <article className="settings-item settings-create-card">
          <div className="settings-item-header">
            <div>
              <h3>Новая услуга</h3>
              <p className="settings-meta">Добавьте новую позицию и сразу настройте, что клиент может выбрать вместе с ней.</p>
            </div>
            <button className="primary-button" onClick={submitCreateService} type="button">
              <Plus size={17} /> Добавить услугу
            </button>
          </div>

          <div className="field-row">
            <label>
              Название
              <input
                type="text"
                value={createForm.title}
                onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Например, покрытие с дизайном"
              />
            </label>
            <label>
              Цена от, ₽
              <input
                type="number"
                min="0"
                value={createForm.priceFrom}
                onChange={(event) => setCreateForm((current) => ({ ...current, priceFrom: event.target.value }))}
                placeholder="0"
              />
            </label>
          </div>

          <div className="field-row settings-grid-balanced">
            <label>
              Длительность, мин
              <input
                type="number"
                min="0"
                value={createForm.durationMinutes}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, durationMinutes: event.target.value }))
                }
              />
            </label>

            <div className="settings-flags compact">
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={createForm.requiresHandPhoto}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, requiresHandPhoto: event.target.checked }))
                  }
                />
                <span className="checkbox-copy">
                  <strong>Нужно фото рук</strong>
                  <small>Чтобы заранее увидеть состояние ногтей.</small>
                </span>
              </label>

              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={createForm.requiresReference}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, requiresReference: event.target.checked }))
                  }
                />
                <span className="checkbox-copy">
                  <strong>Нужен референс</strong>
                  <small>Чтобы точнее понять желаемый дизайн.</small>
                </span>
              </label>
            </div>
          </div>

          <div className="settings-options-grid">
            {serviceOptions.map((option) => (
              <label className="checkbox-line option-row option-row-compact" key={`create-${option.id}`}>
                <input
                  type="checkbox"
                  checked={createForm.options.includes(option.id)}
                  onChange={() => toggleServiceOption("create", option.id)}
                />
                <span className="checkbox-copy">
                  <strong>{option.title}</strong>
                  <small>
                    +{option.durationMinutes} мин
                    {option.priceFrom ? ` · от ${option.priceFrom.toLocaleString("ru-RU")} ₽` : ""}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </article>

        {serviceError ? <p className="error-text">{serviceError}</p> : null}

        <div className="settings-list">
          {services.map((service) => (
            <article className="settings-item" key={service.id}>
              <div className="settings-item-header">
                <div>
                  <h3>{service.title}</h3>
                  <p className="settings-meta">ID: {service.id}</p>
                </div>

                <button
                  className="danger-button settings-delete-button"
                  onClick={() => removeService(service.id)}
                  type="button"
                >
                  <Trash2 size={16} /> Удалить
                </button>
              </div>

              <div className="field-row">
                <label>
                  Название
                  <input
                    type="text"
                    value={serviceDrafts[service.id]?.title ?? service.title}
                    onChange={(event) => updateDraft(service.id, { title: event.target.value })}
                  />
                </label>
                <label>
                  Длительность, мин
                  <input
                    type="number"
                    min="0"
                    value={serviceDrafts[service.id]?.durationMinutes ?? String(service.durationMinutes)}
                    onChange={(event) => updateDraft(service.id, { durationMinutes: event.target.value })}
                  />
                </label>
                <label>
                  Цена от, ₽
                  <input
                    type="number"
                    min="0"
                    value={serviceDrafts[service.id]?.priceFrom ?? String(service.priceFrom ?? "")}
                    onChange={(event) => updateDraft(service.id, { priceFrom: event.target.value })}
                  />
                </label>
              </div>

              <div className="settings-flags">
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={serviceDrafts[service.id]?.requiresHandPhoto ?? service.requiresHandPhoto}
                    onChange={(event) => updateDraft(service.id, { requiresHandPhoto: event.target.checked })}
                  />
                  <span className="checkbox-copy">
                    <strong>Обязательно фото рук</strong>
                    <small>Я заранее увижу состояние ногтей и смогу точнее подтвердить запись.</small>
                  </span>
                </label>

                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={serviceDrafts[service.id]?.requiresReference ?? service.requiresReference}
                    onChange={(event) => updateDraft(service.id, { requiresReference: event.target.checked })}
                  />
                  <span className="checkbox-copy">
                    <strong>Обязательно фото референса</strong>
                    <small>Так проще понять желаемую форму, длину и настроение дизайна.</small>
                  </span>
                </label>
              </div>

              <div className="settings-options-grid">
                {serviceOptions.map((option) => (
                  <label className="checkbox-line option-row option-row-compact" key={`${service.id}-${option.id}`}>
                    <input
                      type="checkbox"
                      checked={(serviceDrafts[service.id]?.options ?? service.options).includes(option.id)}
                      onChange={() => toggleServiceOption("draft", option.id, service.id)}
                    />
                    <span className="checkbox-copy">
                      <strong>{option.title}</strong>
                      <small>
                        +{option.durationMinutes} мин
                        {option.priceFrom ? ` · от ${option.priceFrom.toLocaleString("ru-RU")} ₽` : ""}
                      </small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="settings-actions">
                <button className="secondary-button" onClick={() => resetService(service)} type="button">
                  Отменить правки
                </button>
                <button className="primary-button" onClick={() => saveService(service.id)} type="button">
                  Сохранить услугу
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="section-title settings-subsection">
          <Sparkles size={20} />
          <div>
            <h2>Дополнительно</h2>
            <p>Здесь можно полностью управлять допами: снять старое покрытие, дизайн, ремонт и любые свои позиции.</p>
          </div>
        </div>

        <article className="settings-item settings-create-card">
          <div className="settings-item-header">
            <div>
              <h3>Новое дополнение</h3>
              <p className="settings-meta">Эти позиции потом можно подключать к любым услугам выше.</p>
            </div>
            <button className="primary-button" onClick={submitCreateOption} type="button">
              <Plus size={17} /> Добавить дополнение
            </button>
          </div>

          <div className="field-row">
            <label>
              Название
              <input
                type="text"
                value={createOptionForm.title}
                onChange={(event) =>
                  setCreateOptionForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Например, сложный дизайн"
              />
            </label>
            <label>
              Длительность, мин
              <input
                type="number"
                min="0"
                value={createOptionForm.durationMinutes}
                onChange={(event) =>
                  setCreateOptionForm((current) => ({ ...current, durationMinutes: event.target.value }))
                }
              />
            </label>
            <label>
              Цена от, ₽
              <input
                type="number"
                min="0"
                value={createOptionForm.priceFrom}
                onChange={(event) =>
                  setCreateOptionForm((current) => ({ ...current, priceFrom: event.target.value }))
                }
                placeholder="0"
              />
            </label>
          </div>
        </article>

        {optionError ? <p className="error-text">{optionError}</p> : null}

        <div className="settings-list">
          {serviceOptions.map((option) => (
            <article className="settings-item" key={option.id}>
              <div className="settings-item-header">
                <div>
                  <h3>{option.title}</h3>
                  <p className="settings-meta">ID: {option.id}</p>
                </div>
                <button
                  className="danger-button settings-delete-button"
                  onClick={() => removeOption(option.id)}
                  type="button"
                >
                  <Trash2 size={16} /> Удалить
                </button>
              </div>

              <div className="field-row">
                <label>
                  Название
                  <input
                    type="text"
                    value={optionDrafts[option.id]?.title ?? option.title}
                    onChange={(event) => updateOptionDraft(option.id, { title: event.target.value })}
                  />
                </label>
                <label>
                  Длительность, мин
                  <input
                    type="number"
                    min="0"
                    value={optionDrafts[option.id]?.durationMinutes ?? String(option.durationMinutes)}
                    onChange={(event) =>
                      updateOptionDraft(option.id, { durationMinutes: event.target.value })
                    }
                  />
                </label>
                <label>
                  Цена от, ₽
                  <input
                    type="number"
                    min="0"
                    value={optionDrafts[option.id]?.priceFrom ?? String(option.priceFrom ?? "")}
                    onChange={(event) => updateOptionDraft(option.id, { priceFrom: event.target.value })}
                  />
                </label>
              </div>

              <div className="settings-actions">
                <button className="secondary-button" onClick={() => resetOption(option)} type="button">
                  Отменить правки
                </button>
                <button className="primary-button" onClick={() => saveOption(option.id)} type="button">
                  Сохранить дополнение
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="panel settings-panel">
        <div className="section-title">
          <CalendarClock size={22} />
          <div>
            <h2>Окошки</h2>
            <p>Можно добавить свободное окно или закрыть его вручную.</p>
          </div>
        </div>

        <div className="window-form">
          <label>
            Дата
            <input
              type="date"
              value={windowForm.date}
              onChange={(event) => setWindowForm({ ...windowForm, date: event.target.value })}
            />
          </label>
          <div className="field-row">
            <label>
              Начало
              <input
                type="time"
                value={windowForm.start}
                onChange={(event) => setWindowForm({ ...windowForm, start: event.target.value })}
              />
            </label>
            <label>
              Конец
              <input
                type="time"
                value={windowForm.end}
                onChange={(event) => setWindowForm({ ...windowForm, end: event.target.value })}
              />
            </label>
          </div>
          <button className="primary-button" onClick={submitWindow} type="button">
            <Plus size={17} /> Добавить окошко
          </button>
        </div>

        <div className="window-list">
          {windows.map((window) => (
            <div className="window-item" key={window.id}>
              <div>
                <strong>{window.label}</strong>
                <span>{windowStatusLabel(window.status)}</span>
              </div>
              {window.status === "reserved" ? (
                <button className="secondary-button" disabled>
                  Занято
                </button>
              ) : window.status === "blocked" ? (
                <button
                  className="secondary-button"
                  onClick={() => updateWindowStatus(window.id, "available")}
                  type="button"
                >
                  Открыть
                </button>
              ) : (
                <button
                  className="danger-button"
                  onClick={() => updateWindowStatus(window.id, "blocked")}
                  type="button"
                >
                  Закрыть
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function toServiceEditorState(service: ServicePreset): ServiceEditorState {
  return {
    title: service.title,
    durationMinutes: String(service.durationMinutes),
    priceFrom: service.priceFrom !== undefined ? String(service.priceFrom) : "",
    requiresHandPhoto: service.requiresHandPhoto,
    requiresReference: service.requiresReference,
    options: [...service.options],
  };
}

function toOptionEditorState(option: ServiceOption): OptionEditorState {
  return {
    title: option.title,
    durationMinutes: String(option.durationMinutes),
    priceFrom: option.priceFrom !== undefined ? String(option.priceFrom) : "",
  };
}

function parseServiceEditor(state: ServiceEditorState | undefined, id: string): ServicePreset | null {
  if (!state) {
    return null;
  }

  const title = state.title.trim();
  const durationMinutes = Number(state.durationMinutes);
  const priceFrom = state.priceFrom.trim() ? Number(state.priceFrom) : undefined;

  if (!title || Number.isNaN(durationMinutes) || durationMinutes < 0) {
    return null;
  }

  if (priceFrom !== undefined && (Number.isNaN(priceFrom) || priceFrom < 0)) {
    return null;
  }

  return {
    id,
    title,
    durationMinutes,
    priceFrom,
    requiresHandPhoto: state.requiresHandPhoto,
    requiresReference: state.requiresReference,
    options: [...state.options],
  };
}

function parseOptionEditor(state: OptionEditorState | undefined, id: string): ServiceOption | null {
  if (!state) {
    return null;
  }

  const title = state.title.trim();
  const durationMinutes = Number(state.durationMinutes);
  const priceFrom = state.priceFrom.trim() ? Number(state.priceFrom) : undefined;

  if (!title || Number.isNaN(durationMinutes) || durationMinutes < 0) {
    return null;
  }

  if (priceFrom !== undefined && (Number.isNaN(priceFrom) || priceFrom < 0)) {
    return null;
  }

  return {
    id,
    title,
    durationMinutes,
    priceFrom,
  };
}

function makeServiceId(title: string, existingIds: string[]) {
  const normalized = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  const baseId = normalized || `service-${Date.now()}`;
  let candidate = baseId;
  let index = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }

  return candidate;
}

function RequestCard({
  client,
  photos,
  request,
  windows,
  confirmRequest,
  updateStatus,
  updateWindow,
}: {
  client?: Client;
  photos: PhotoAttachment[];
  request: BookingRequest;
  windows: TimeWindow[];
  confirmRequest: (id: string) => void;
  updateStatus: (id: string, status: RequestStatus) => void;
  updateWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) => void;
}) {
  const selectedWindow = request.preferredWindowId
    ? windows.find((window) => window.id === request.preferredWindowId)
    : null;
  const hasConcreteWindow = Boolean(selectedWindow);
  const handPhoto = photos.find((photo) => photo.kind === "hands");
  const referencePhoto = photos.find((photo) => photo.kind === "reference");

  return (
    <article className="panel request-card">
      <div className="card-header">
        <div>
          <span className={`status ${request.status}`}>{statusLabels[request.status]}</span>
          <h3>{client?.name ?? "Клиент"}</h3>
        </div>
        <span className="request-id">{request.id}</span>
      </div>

      <div className="info-grid">
        <Info icon={<Phone size={16} />} label="Телефон" value={client?.phone ?? "Не указан"} />
        <Info
          icon={<MessageCircle size={16} />}
          label="Связь"
          value={client ? `${contactLabels[client.preferredContactChannel]} ${client.contactHandle}` : "Не указана"}
        />
        <Info
          label="Клиент"
          value={client?.firstVisit ? "Первый раз, проверить фото рук" : "Постоянный"}
        />
        <Info label="Процедура" value={serviceTitle(request.service)} />
        <Info label="Допы" value={request.optionIds.map(optionTitle).join(", ") || "Без допов"} />
        <Info label="Длина" value={lengthLabels[request.length]} />
        <Info label="Окошко" value={selectedWindow?.label ?? request.customWindowText ?? "Нужно согласовать"} />
        <Info label="Фото рук" value={handPhoto?.fileName ?? "Не приложено"} />
        <Info label="Референс" value={referencePhoto?.fileName ?? "Не приложено"} />
        <Info label="Стоимость" value={`от ${(request.estimatedPriceFrom ?? 0).toLocaleString("ru-RU")} ₽`} />
      </div>

      <div className="client-text">
        <strong>Что хочет клиент</strong>
        <p>{request.desiredResult}</p>
        {request.comment && <p>{request.comment}</p>}
        <span>Расчет: {request.estimatedMinutes} мин</span>
        {!hasConcreteWindow && <span>Нельзя подтвердить без конкретного окошка.</span>}
      </div>

      <label className="move-window-field">
        Предложить другое окошко
        <select
          value={request.preferredWindowId ?? customWindowValue}
          onChange={(event) => {
            const value = event.target.value;
            updateWindow(request.id, value === customWindowValue ? null : value);
          }}
        >
          {windows
            .filter(
              (window) =>
                window.status === "available" ||
                window.status === "offered" ||
                window.id === request.preferredWindowId,
            )
            .map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
          <option value={customWindowValue}>Нужно согласовать другое время</option>
        </select>
      </label>

      <div className="action-row">
        <button
          onClick={() => confirmRequest(request.id)}
          className="success-button"
          disabled={!hasConcreteWindow || request.status === "confirmed"}
        >
          <Check size={17} /> Принять
        </button>
        <button onClick={() => updateStatus(request.id, "needs_clarification")} className="secondary-button">
          <ChevronRight size={17} /> Уточнить
        </button>
        <button onClick={() => updateStatus(request.id, "waiting_client")} className="secondary-button">
          <MoveRight size={17} /> Другое время
        </button>
        <button onClick={() => updateStatus(request.id, "declined")} className="danger-button">
          <X size={17} /> Отказать
        </button>
      </div>
    </article>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="info-item">
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function serviceTitle(id: ServiceKind) {
  return runtimeServiceCatalog.find((service) => service.id === id)?.title ?? id;
}

function optionTitle(id: ServiceOptionKind) {
  return runtimeOptionCatalog.find((option) => option.id === id)?.title ?? id;
}

function formatDayLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startAt));
  const end = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(endAt));
  return `${start}-${end}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function makeWindowLabel(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(start);
  const startTime = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
  const endTime = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(end);

  return `${date}, ${startTime}-${endTime}`;
}

function windowStatusLabel(status: TimeWindowStatus) {
  const labels: Record<TimeWindowStatus, string> = {
    available: "Свободно",
    offered: "Предложено",
    reserved: "Занято",
    blocked: "Закрыто",
  };

  return labels[status];
}
