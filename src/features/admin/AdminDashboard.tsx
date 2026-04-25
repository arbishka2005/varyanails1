import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  contactLabels,
  formatDateTime,
  formatTimeRange,
  getServiceTitle,
  statusLabels,
} from "../../lib/bookingPresentation";
import { compareDateTimeAsc, compareDateTimeDesc, getLocalDateKey, getTodayDateKey } from "../../lib/dateTime";
import { type MasterWorkspaceSectionProps } from "./masterWorkspaceTypes";
import type { BookingRequest, ServicePreset } from "../../types";

export function AdminDashboard({
  appointments,
  clients,
  onNavigate,
  requests,
  services,
  updateAppointmentStatus,
}: Pick<
  MasterWorkspaceSectionProps,
  "appointments" | "clients" | "onNavigate" | "requests" | "services" | "updateAppointmentStatus"
>) {
  const [focusedAppointmentId, setFocusedAppointmentId] = useState<string | null>(null);
  const [isAppointmentActionBusy, setIsAppointmentActionBusy] = useState(false);
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

  const focusedAppointment = useMemo(() => {
    if (!focusedAppointmentId) {
      return null;
    }

    return todayAppointments.find((appointment) => appointment.id === focusedAppointmentId) ?? null;
  }, [focusedAppointmentId, todayAppointments]);

  useEffect(() => {
    if (!focusedAppointment) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusedAppointmentId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedAppointment]);

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
        .slice(0, 3),
    [clients, requests, services],
  );

  return (
    <section className="admin-dashboard-stack admin-today-console">
      <article className="panel admin-preview-panel">
        <div className="section-inline-title">
          <strong>Записи сегодня</strong>
          <span>{todayAppointments.length > 0 ? `${todayAppointments.length} по порядку` : "нет записей"}</span>
        </div>

        <div className="admin-preview-list">
          {todayAppointments.length === 0 ? (
            <div className="empty-state">Сегодня без записей.</div>
          ) : (
            todayAppointments.map((appointment) => (
              <button
                className="admin-preview-item"
                key={appointment.id}
                onClick={() => setFocusedAppointmentId(appointment.id)}
                type="button"
              >
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

      {requestsToAnswer.length > 0 ? (
        <article className="panel admin-preview-panel">
          <div className="section-inline-title">
            <strong>Нужно ответить</strong>
            <span>{requestsToAnswer.length} в фокусе</span>
          </div>

          <div className="admin-preview-list">
            {requestsToAnswer.map((request) => (
              <button className="admin-preview-item" key={request.id} onClick={() => onNavigate("requests")} type="button">
                <span className={`status ${request.status}`}>{statusLabels[request.status]}</span>
                <strong>
                  {request.client?.name ?? "Клиентка"} · {getServiceTitle(services, request.service)}
                </strong>
                <small>{formatDateTime(request.createdAt)}</small>
              </button>
            ))}
          </div>
        </article>
      ) : null}

      {focusedAppointment ? (
        <div
          className="admin-lightbox"
          onClick={() => {
            if (!isAppointmentActionBusy) {
              setFocusedAppointmentId(null);
            }
          }}
          role="presentation"
        >
          <div
            className="admin-lightbox-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Детали записи"
          >
            <button
              className="admin-lightbox-close"
              onClick={() => setFocusedAppointmentId(null)}
              type="button"
              aria-label="Закрыть"
              disabled={isAppointmentActionBusy}
            >
              <X size={18} />
            </button>

            <div className="admin-lightbox-header">
              <span className="status confirmed">Запись</span>
              <strong>{focusedAppointment.client?.name ?? "Клиентка"}</strong>
              <small>
                {formatTimeRange(focusedAppointment.startAt, focusedAppointment.endAt)} ·{" "}
                {getServiceTitle(services, focusedAppointment.service)}
              </small>
            </div>

            <div className="admin-lightbox-meta">
              <div>
                <span className="info-item-label">Контакт</span>
                <strong>{contactLabels[focusedAppointment.client?.preferredContactChannel ?? "phone"]}</strong>
                <small>{focusedAppointment.client?.contactHandle ?? focusedAppointment.client?.phone ?? "не указан"}</small>
              </div>
              <div>
                <span className="info-item-label">Стоимость</span>
                <strong>{formatMoney(getRequestPrice(focusedAppointment.request, services))}</strong>
                <small>{focusedAppointment.durationMinutes} мин</small>
              </div>
            </div>

            <div className="action-row">
              <button
                className="ghost-button"
                onClick={() => {
                  setFocusedAppointmentId(null);
                  onNavigate("schedule");
                }}
                type="button"
                disabled={isAppointmentActionBusy}
              >
                Открыть в расписании
              </button>
              <button
                className="danger-button"
                onClick={async () => {
                  if (!globalThis.confirm("Отменить запись?")) {
                    return;
                  }

                  setIsAppointmentActionBusy(true);
                  try {
                    await updateAppointmentStatus(focusedAppointment.id, "cancelled");
                    setFocusedAppointmentId(null);
                  } finally {
                    setIsAppointmentActionBusy(false);
                  }
                }}
                type="button"
                disabled={isAppointmentActionBusy}
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
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
