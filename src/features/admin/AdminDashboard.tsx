import { useMemo, useState } from "react";
import { AlertCircle, Clock3, MessageCircle, Sparkles, Wallet } from "lucide-react";
import {
  contactLabels,
  formatDateTime,
  formatTimeRange,
  getServiceTitle,
  statusLabels,
} from "../../lib/bookingPresentation";
import { compareDateTimeAsc, compareDateTimeDesc, getLocalDateKey, getTodayDateKey, isFutureDateTime } from "../../lib/dateTime";
import { type MasterWorkspaceSectionProps } from "./masterWorkspaceTypes";
import type { Appointment, BookingRequest, Client, ServicePreset, TimeWindow } from "../../types";

type DashboardRequest = BookingRequest & { client?: Client; servicePreset?: ServicePreset };
type DashboardAppointment = Appointment & { client?: Client; request?: BookingRequest };
type DashboardWarning = {
  id: string;
  title: string;
  detail: string;
  action: "requests" | "schedule";
};
type QuickMessage = {
  id: string;
  label: string;
  text: string;
};

export function AdminDashboard({
  appointments,
  clients,
  onNavigate,
  requests,
  services,
  windows,
}: Pick<
  MasterWorkspaceSectionProps,
  "appointments" | "clients" | "onNavigate" | "requests" | "services" | "windows"
>) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const todayKey = getTodayDateKey();

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "scheduled" && getLocalDateKey(appointment.startAt) === todayKey)
        .map((appointment) => ({
          ...appointment,
          client: clients.find((client) => client.id === appointment.clientId),
          request: requests.find((request) => request.id === appointment.requestId),
        }))
        .sort((left, right) => compareDateTimeAsc(left.startAt, right.startAt)),
    [appointments, clients, requests, todayKey],
  );

  const nextAppointment = useMemo(
    () => todayAppointments.find((appointment) => isFutureDateTime(appointment.endAt)) ?? null,
    [todayAppointments],
  );

  const requestsToAnswer = useMemo(
    () =>
      requests
        .filter((request) => request.status === "new" || request.status === "needs_clarification")
        .map((request) => ({
          ...request,
          client: clients.find((client) => client.id === request.clientId),
          servicePreset: services.find((service) => service.id === request.service),
        }))
        .sort((left, right) => compareDateTimeDesc(left.createdAt, right.createdAt))
        .slice(0, 4),
    [clients, requests, services],
  );

  const todayWindows = useMemo(
    () => windows.filter((window) => getLocalDateKey(window.startAt) === todayKey),
    [todayKey, windows],
  );
  const openWindowsToday = todayWindows.filter(
    (window) => window.status === "available" && isFutureDateTime(window.startAt),
  );

  const dayRevenue = todayAppointments.reduce(
    (sum, appointment) => sum + getRequestPrice(appointment.request, services),
    0,
  );

  const warnings = useMemo(
    () => buildDashboardWarnings(requestsToAnswer, requests, services, openWindowsToday),
    [openWindowsToday, requests, requestsToAnswer, services],
  );

  const quickMessages = useMemo(
    () => buildQuickMessages(nextAppointment, requestsToAnswer[0]),
    [nextAppointment, requestsToAnswer],
  );

  const copyMessage = async (message: QuickMessage) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1400);
    } catch {
      window.prompt("Скопируй текст сообщения", message.text);
    }
  };

  return (
    <section className="admin-dashboard-stack admin-today-console">
      <article className="panel admin-focus-card admin-today-hero">
        <div className="admin-focus-copy">
          <p className="eyebrow">сегодня</p>
          <h2>{nextAppointment ? "Следующая клиентка уже в фокусе" : "Записей нет, можно расслабиться"}</h2>
          {nextAppointment ? (
            <div className="admin-next-client">
              <strong>{nextAppointment.client?.name ?? "Клиентка"}</strong>
              <span>
                {formatTimeRange(nextAppointment.startAt, nextAppointment.endAt)} · {getServiceTitle(services, nextAppointment.service)}
              </span>
            </div>
          ) : (
            <p className="admin-focus-note">Проверь заявки или открой окошко.</p>
          )}
        </div>

        <div className="admin-focus-stats admin-today-stats" aria-label="Пульт мастера на сегодня">
          <article className="admin-focus-stat">
            <span>Записи</span>
            <strong>{todayAppointments.length}</strong>
            <small>сегодня</small>
          </article>
          <article className="admin-focus-stat">
            <span>Ответить</span>
            <strong>{requestsToAnswer.length}</strong>
            <small>ждут тебя</small>
          </article>
          <article className="admin-focus-stat">
            <span>Доход</span>
            <strong>{formatMoney(dayRevenue)}</strong>
            <small>ожидаемо</small>
          </article>
        </div>
      </article>

      <section className="admin-dashboard-grid admin-today-grid">
        <article className="panel admin-preview-panel admin-next-panel">
          <div className="section-inline-title">
            <strong>Следующая клиентка</strong>
            <span>{nextAppointment ? "готовим место" : "пока пусто"}</span>
          </div>

          {nextAppointment ? (
            <button className="admin-next-appointment-card" onClick={() => onNavigate("schedule")} type="button">
              <span className="status confirmed">Записана</span>
              <strong>{nextAppointment.client?.name ?? "Клиентка"}</strong>
              <small>{contactLabels[nextAppointment.client?.preferredContactChannel ?? "phone"]} · {nextAppointment.client?.contactHandle ?? nextAppointment.client?.phone ?? "контакт не указан"}</small>
              <div className="admin-next-appointment-meta">
                <span>
                  <Clock3 size={15} /> {formatTimeRange(nextAppointment.startAt, nextAppointment.endAt)}
                </span>
                <span>{getServiceTitle(services, nextAppointment.service)}</span>
              </div>
            </button>
          ) : (
            <div className="empty-state">На сегодня ближайшей записи нет.</div>
          )}
        </article>

        <article className="panel admin-preview-panel">
          <div className="section-inline-title">
            <strong>Быстрые сообщения</strong>
            <span>{copiedMessageId ? "скопировано" : "для мессенджера"}</span>
          </div>

          <div className="admin-quick-message-list">
            {quickMessages.map((message) => (
              <button className="admin-quick-message" key={message.id} onClick={() => copyMessage(message)} type="button">
                <MessageCircle size={17} />
                <span>{copiedMessageId === message.id ? "Скопировано" : message.label}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel admin-preview-panel">
          <div className="section-inline-title">
            <strong>Нужно ответить</strong>
            <span>{requestsToAnswer.length > 0 ? `${requestsToAnswer.length} в фокусе` : "чисто"}</span>
          </div>

          <div className="admin-preview-list">
            {requestsToAnswer.length === 0 ? (
              <div className="empty-state">Нет заявок, где нужен твой ответ.</div>
            ) : (
              requestsToAnswer.map((request) => (
                <button className="admin-preview-item" key={request.id} onClick={() => onNavigate("requests")} type="button">
                  <span className={`status ${request.status}`}>{statusLabels[request.status]}</span>
                  <strong>
                    {request.client?.name ?? "Клиентка"} · {getServiceTitle(services, request.service)}
                  </strong>
                  <small>{formatDateTime(request.createdAt)}</small>
                </button>
              ))
            )}
          </div>
        </article>

        <article className="panel admin-preview-panel">
          <div className="section-inline-title">
            <strong>Записи на сегодня</strong>
            <span>{todayAppointments.length > 0 ? "по порядку" : "нет записей"}</span>
          </div>

          <div className="admin-preview-list">
            {todayAppointments.length === 0 ? (
              <div className="empty-state">Сегодня без записей. Можно занять свободное окошко.</div>
            ) : (
              todayAppointments.map((appointment) => (
                <button className="admin-preview-item" key={appointment.id} onClick={() => onNavigate("schedule")} type="button">
                  <span className="status confirmed">{formatTimeRange(appointment.startAt, appointment.endAt)}</span>
                  <strong>
                    {appointment.client?.name ?? "Клиентка"} · {getServiceTitle(services, appointment.service)}
                  </strong>
                  <small>{appointment.durationMinutes} мин · {formatMoney(getRequestPrice(appointment.request, services))}</small>
                </button>
              ))
            )}
          </div>
        </article>

        <article className="panel admin-preview-panel admin-money-panel">
          <div className="section-inline-title">
            <strong>Сегодня ты накумекала на..</strong>
    
          </div>
          <div className="admin-money-card">
            <Wallet size={20} />
            <strong>{formatMoney(dayRevenue)}</strong>
            <span>{todayAppointments.length > 0 ? "ожидаемый доход по записям" : "записей на сегодня пока нет"}</span>
          </div>
        </article>

        <article className="panel admin-preview-panel">
          <div className="section-inline-title">
            <strong>На заметку</strong>
            <span>{warnings.length > 0 ? "проверь" : "спокойно"}</span>
          </div>

          <div className="admin-warning-list">
            {warnings.length === 0 ? (
              <div className="empty-state">Сейчас ничего не требует внимания.</div>
            ) : (
              warnings.map((warning) => (
                <button className="admin-warning-item" key={warning.id} onClick={() => onNavigate(warning.action)} type="button">
                  <AlertCircle size={17} />
                  <span>
                    <strong>{warning.title}</strong>
                    <small>{warning.detail}</small>
                  </span>
                  <Sparkles size={16} />
                </button>
              ))
            )}
          </div>
        </article>
      </section>
    </section>
  );
}

function buildDashboardWarnings(
  requestsToAnswer: DashboardRequest[],
  allRequests: BookingRequest[],
  services: ServicePreset[],
  openWindowsToday: TimeWindow[],
): DashboardWarning[] {
  const warnings: DashboardWarning[] = [];
  const requestWithoutPhotos = requestsToAnswer.find((request) => {
    const service = services.find((item) => item.id === request.service);
    if (!service) {
      return false;
    }

    return (service.requiresHandPhoto || service.requiresReference) && request.photoIds.length === 0;
  });

  if (requestWithoutPhotos) {
    warnings.push({
      id: "missing-photo",
      title: "Нет фото для оценки",
      detail: `${requestWithoutPhotos.client?.name ?? "Клиентка"} отправила заявку без фото.`,
      action: "requests",
    });
  }

  const waitingClient = allRequests.find((request) => request.status === "waiting_client");
  if (waitingClient) {
    warnings.push({
      id: "waiting-client",
      title: "Старая заявка ждёт клиентку",
      detail: "Это legacy-сценарий. Лучше подтвердить или уточнить вручную.",
      action: "requests",
    });
  }

  if (openWindowsToday.length > 0) {
    warnings.push({
      id: "open-window-today",
      title: "Сегодня есть пустое окошко",
      detail: `${openWindowsToday.length} свободн. можно предложить клиентке.`,
      action: "schedule",
    });
  }

  return warnings.slice(0, 3);
}

function buildQuickMessages(nextAppointment: DashboardAppointment | null, requestToAnswer?: DashboardRequest): QuickMessage[] {
  const clientName = nextAppointment?.client?.name ?? requestToAnswer?.client?.name ?? "";
  const appointmentTime = nextAppointment ? formatTimeRange(nextAppointment.startAt, nextAppointment.endAt) : "";

  return [
    {
      id: "confirm",
      label: "Подтвердить запись",
      text: clientName
        ? `${clientName}, привет! Подтверждаю запись на ${appointmentTime}. Жду тебя.`
        : "Привет! Подтверждаю запись. Жду тебя.",
    },
    {
      id: "ask-photo",
      label: "Попросить фото",
      text: "Пришли, пожалуйста, фото рук и референс дизайна. Так я точнее оценю время и стоимость.",
    },
    {
      id: "offer-window",
      label: "Предложить окошко",
      text: "Есть свободное окошко. Если удобно, могу поставить тебя на это время.",
    },
  ];
}

function getRequestPrice(request: BookingRequest | undefined, services: ServicePreset[]) {
  if (request?.estimatedPriceFrom) {
    return request.estimatedPriceFrom;
  }

  const service = request ? services.find((item) => item.id === request.service) : null;
  return service?.priceFrom ?? 0;
}

function formatMoney(value: number) {
  if (value <= 0) {
    return "0 ₽";
  }

  return `${value.toLocaleString("ru-RU")} ₽`;
}
