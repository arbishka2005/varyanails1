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
  UserRound,
  X,
} from "lucide-react";
import {
  serviceOptions,
  servicePresets,
  timeWindows,
} from "./data";
import { api } from "./api";
import type {
  AppSnapshot,
  BookingRequest,
  Client,
  ContactChannel,
  PhotoAttachment,
  NailLength,
  RequestStatus,
  ServiceKind,
  ServiceOptionKind,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "./types";

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
  handPhotoName: string;
  referencePhotoName: string;
  preferredWindowId: string;
  customWindowText: string;
  comment: string;
};

const customWindowValue = "custom";
type AdminSection = "requests" | "clients" | "settings";
type AppRoute = { portal: "client" } | { portal: "admin"; section: AdminSection };

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
  handPhotoName: "",
  referencePhotoName: "",
  preferredWindowId: timeWindows[0].id,
  customWindowText: "",
  comment: "",
};

function getRouteFromHash(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");

  if (hash === "admin/clients") {
    return { portal: "admin", section: "clients" };
  }

  if (hash === "admin/settings") {
    return { portal: "admin", section: "settings" };
  }

  if (hash === "admin" || hash === "admin/requests") {
    return { portal: "admin", section: "requests" };
  }

  return { portal: "client" };
}

function navigateTo(hash: string) {
  window.location.hash = hash;
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash());
  const [lastSubmittedRequestId, setLastSubmittedRequestId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [publicConfig, setPublicConfig] = useState<Pick<AppSnapshot, "services" | "windows"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);

  const clients = snapshot?.clients ?? [];
  const photos = snapshot?.photos ?? [];
  const requests = snapshot?.requests ?? [];
  const appointments = snapshot?.appointments ?? [];
  const windows = route.portal === "admin" ? (snapshot?.windows ?? []) : (publicConfig?.windows ?? timeWindows);
  const services =
    route.portal === "admin"
      ? snapshot?.services.length ? snapshot.services : servicePresets
      : publicConfig?.services.length ? publicConfig.services : servicePresets;

  const refreshSnapshot = async () => {
    try {
      setApiError(null);
      const nextSnapshot = await api.getSnapshot();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось подключиться к API");
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

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    if (route.portal === "admin") {
      void refreshSnapshot();
      return;
    }

    void refreshPublicConfig();
  }, [route.portal]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.service)!,
    [form.service, services],
  );

  const selectedOptions = useMemo(
    () => serviceOptions.filter((option) => form.optionIds.includes(option.id)),
    [form.optionIds],
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

  const submitRequest = async () => {
    const client: Client = {
      id: `CLI-${Date.now()}`,
      name: form.clientName.trim(),
      phone: form.phone.trim(),
      preferredContactChannel: form.contactChannel,
      contactHandle: form.contactHandle.trim(),
      firstVisit: form.isNewClient,
    };
    const newPhotos: PhotoAttachment[] = [
      form.handPhotoName
        ? {
            id: `PHOTO-HANDS-${Date.now()}`,
            kind: "hands",
            fileName: form.handPhotoName.trim(),
          }
        : null,
      form.referencePhotoName
        ? {
            id: `PHOTO-REF-${Date.now()}`,
            kind: "reference",
            fileName: form.referencePhotoName.trim(),
          }
        : null,
    ].filter((photo): photo is PhotoAttachment => Boolean(photo));
    const request: BookingRequest = {
      id: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      clientId: client.id,
      service: form.service,
      optionIds: form.optionIds,
      length: form.length,
      desiredResult: form.desiredResult.trim(),
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
      await refreshSnapshot();
      setLastSubmittedRequestId(request.id);
      setForm(initialForm);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось отправить заявку");
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
          {lastSubmittedRequestId && (
            <div className="panel notice-panel">
              Заявка {lastSubmittedRequestId} отправлена. Мастер проверит фото, время и детали.
            </div>
          )}
          <ClientRequestForm
            form={form}
            estimatedMinutes={estimatedMinutes}
            estimatedPriceFrom={estimatedPriceFrom}
            requiresHandPhoto={form.isNewClient || selectedService.requiresHandPhoto}
            requiresReference={selectedService.requiresReference}
            services={services}
            selectedService={selectedService}
            availableWindows={windows.filter(
              (window) => window.status === "available" || window.status === "offered",
            )}
            setForm={setForm}
            submitRequest={submitRequest}
          />
        </>
      )}

      {route.portal === "admin" && (
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
            <SettingsWorkspace
              services={services}
              windows={windows}
              addTimeWindow={addTimeWindow}
              updateService={updateService}
              updateWindowStatus={updateWindowStatus}
            />
          )}
        </>
      )}
    </main>
  );
}

function ClientHeader() {
  return (
    <section className="topbar">
      <div>
        <p className="eyebrow">Varya Nails</p>
        <h1>Заявка на ногти</h1>
      </div>
    </section>
  );
}

function AdminHeader({ section }: { section: AdminSection }) {
  return (
    <section className="topbar">
      <div>
        <p className="eyebrow">Varya Nails · Админ</p>
        <h1>Рабочее место мастера</h1>
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
  selectedService,
  availableWindows,
  setForm,
  submitRequest,
}: {
  form: FormState;
  estimatedMinutes: number;
  estimatedPriceFrom: number;
  requiresHandPhoto: boolean;
  requiresReference: boolean;
  services: ServicePreset[];
  selectedService: (typeof servicePresets)[number];
  availableWindows: TimeWindow[];
  setForm: (next: FormState) => void;
  submitRequest: () => void;
}) {
  const currentOptions = serviceOptions.filter((option) => selectedService.options.includes(option.id));
  const needsCustomWindow = form.preferredWindowId === customWindowValue;
  const requiredFilled =
    form.clientName &&
    form.phone &&
    form.contactHandle &&
    form.desiredResult &&
    (needsCustomWindow ? form.customWindowText : form.preferredWindowId) &&
    (!requiresHandPhoto || form.handPhotoName) &&
    (!requiresReference || form.referencePhotoName);

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

        <label>
          Имя
          <input
            value={form.clientName}
            onChange={(event) => setForm({ ...form, clientName: event.target.value })}
            placeholder="Например, Алина"
          />
        </label>

        <label>
          Номер телефона
          <input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="+7 ..."
          />
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
              value={form.contactHandle}
              onChange={(event) => setForm({ ...form, contactHandle: event.target.value })}
              placeholder="@username или vk.com/..."
            />
          </label>
        </div>

        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={form.isNewClient}
            onChange={(event) => setForm({ ...form, isNewClient: event.target.checked })}
          />
          Я первый раз у мастера
        </label>

        <div className="field-row">
          <label>
            Процедура
            <select
              value={form.service}
              onChange={(event) => chooseService(event.target.value as ServiceKind)}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.title}
                </option>
              ))}
            </select>
          </label>
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
              {option.title} · +{option.durationMinutes} мин
            </label>
          ))}
        </fieldset>

        <label>
          Что будем делать
          <textarea
            value={form.desiredResult}
            onChange={(event) => setForm({ ...form, desiredResult: event.target.value })}
            placeholder="Наращивание, коррекция, на свои, дизайн, ремонт, снятие..."
          />
        </label>

        <div className="field-row">
          <label>
            {requiresHandPhoto ? "Фото своих рук" : "Фото своих рук, если есть изменения"}
            <input
              value={form.handPhotoName}
              onChange={(event) => setForm({ ...form, handPhotoName: event.target.value })}
              placeholder={requiresHandPhoto ? "hands.jpg, обязательно" : "hands.jpg, если нужно"}
            />
          </label>
          <label>
            {requiresReference ? "Фото референса" : "Фото референса, если нужно"}
            <input
              value={form.referencePhotoName}
              onChange={(event) => setForm({ ...form, referencePhotoName: event.target.value })}
              placeholder={requiresReference ? "reference.jpg, обязательно" : "reference.jpg, если нужно"}
            />
          </label>
        </div>

        <label>
          Окошко
          <select
            value={form.preferredWindowId}
            onChange={(event) => setForm({ ...form, preferredWindowId: event.target.value })}
          >
            {availableWindows.map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
            <option value={customWindowValue}>Хочу другое время</option>
          </select>
        </label>

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
        <button className="primary-button" disabled={!requiredFilled} onClick={submitRequest}>
          Отправить заявку <Send size={18} />
        </button>
        {!requiredFilled && (
          <span className="hint">
            Заполните имя, телефон, контакт, описание, время
            {requiresHandPhoto && requiresReference
              ? ", фото рук и референс."
              : requiresHandPhoto
                ? " и фото рук."
                : requiresReference
                  ? " и референс."
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
}: {
  appointments: AppSnapshot["appointments"];
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  windows: TimeWindow[];
  confirmRequest: (id: string) => void;
  updateStatus: (id: string, status: RequestStatus) => void;
  updateWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) => void;
}) {
  return (
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
        {appointments.length === 0 ? (
          <div className="empty-state">Пока нет подтвержденных записей.</div>
        ) : (
          appointments.map((appointment) => {
            const client = clients.find((item) => item.id === appointment.clientId);
            return (
              <div className="calendar-item" key={appointment.id}>
                <strong>{formatDateTime(appointment.startAt)}</strong>
                <span>{client?.name ?? "Клиент"}</span>
                <small>{serviceTitle(appointment.service)} · {appointment.durationMinutes} мин</small>
              </div>
            );
          })
        )}
        <button className="secondary-button">
          <Plus size={17} /> Создать запись вручную
        </button>
      </aside>
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
  return (
    <section className="clients-layout">
      <div className="section-title">
        <UserRound size={22} />
        <div>
          <h2>Клиентская база</h2>
          <p>Контакты, история заявок и заметки мастера собраны в одном месте.</p>
        </div>
      </div>

      <div className="client-card-grid">
        {clients.map((client) => {
          const clientRequests = requests.filter((request) => request.clientId === client.id);
          const clientAppointments = appointments.filter((appointment) => appointment.clientId === client.id);
          const clientPhotoIds = new Set(clientRequests.flatMap((request) => request.photoIds));
          const clientPhotos = photos.filter((photo) => clientPhotoIds.has(photo.id));
          const latestRequest = clientRequests[0];

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
        })}
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
                  Обязательно фото рук
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={service.requiresReference}
                    onChange={(event) =>
                      updateService(service.id, { requiresReference: event.target.checked })
                    }
                  />
                  Обязательно фото референса
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
  return servicePresets.find((service) => service.id === id)?.title ?? id;
}

function optionTitle(id: ServiceOptionKind) {
  return serviceOptions.find((option) => option.id === id)?.title ?? id;
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
