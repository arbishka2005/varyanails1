import { useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import {
  formatDateTime,
  formatDayLabel,
  formatTimeRange,
  getServiceTitle,
  groupWindowsByDate,
  windowStatusLabel,
} from "../../lib/bookingPresentation";
import { AdminScreenHeader } from "./AdminNavigation";
import { type MasterWorkspaceSectionProps } from "./masterWorkspaceTypes";
import type { TimeWindow } from "../../types";

export function AdminScheduleView({
  appointments,
  clients,
  addTimeWindow,
  deleteAppointment,
  onNavigate,
  requests,
  services,
  moveAppointment,
  updateAppointmentStatus,
  updateWindowStatus,
  windows,
}: Pick<
  MasterWorkspaceSectionProps,
  | "appointments"
  | "clients"
  | "addTimeWindow"
  | "deleteAppointment"
  | "onNavigate"
  | "requests"
  | "services"
  | "moveAppointment"
  | "updateAppointmentStatus"
  | "updateWindowStatus"
  | "windows"
>) {
  const [dragAppointmentId, setDragAppointmentId] = useState<string | null>(null);
  const [tapMoveAppointmentId, setTapMoveAppointmentId] = useState<string | null>(null);
  const [dragOverWindowId, setDragOverWindowId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ appointmentId: string; windowId: string } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; label: string } | null>(null);
  const [windowForm, setWindowForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    start: "11:00",
    end: "14:00",
  });

  const windowsByDate = useMemo(() => groupWindowsByDate(windows), [windows]);
  const hasWindowsThisWeek = useMemo(() => windows.some((window) => isWithinNextDays(window.startAt, 7)), [windows]);
  const newRequestsCount = requests.filter((request) => request.status === "new").length;
  const upcomingAppointments = useMemo(
    () =>
      [...appointments]
        .filter(
          (appointment) =>
            appointment.status === "scheduled" && new Date(appointment.startAt).getTime() >= Date.now(),
        )
        .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
        .slice(0, 4),
    [appointments],
  );
  const nextAvailableDays = useMemo(
    () =>
      windowsByDate
        .map((day) => ({
          key: day.dateKey,
          label: day.label,
          availableCount: day.items.filter(
            (window) => window.status === "available" && new Date(window.startAt).getTime() >= Date.now(),
          ).length,
        }))
        .filter((day) => day.availableCount > 0)
        .slice(0, 4),
    [windowsByDate],
  );

  const findAppointmentForWindow = (window: (typeof windows)[number]) =>
    appointments.find(
      (appointment) =>
        appointment.status === "scheduled" &&
        appointment.startAt === window.startAt &&
        appointment.endAt === window.endAt,
    );

  const scheduleMove = (appointmentId: string, windowId: string) => {
    setPendingMove({ appointmentId, windowId });
    setTapMoveAppointmentId(null);
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

  const submitWindow = () => {
    if (!windowForm.date || !windowForm.start || !windowForm.end) {
      return;
    }

    addTimeWindow({
      startAt: `${windowForm.date}T${windowForm.start}:00+03:00`,
      endAt: `${windowForm.date}T${windowForm.end}:00+03:00`,
    });
  };

  const addQuickWindow = (preset: QuickWindowPreset) => {
    const nextWindow = makeQuickWindow(preset);
    setWindowForm({
      date: nextWindow.date,
      start: nextWindow.start,
      end: nextWindow.end,
    });
    addTimeWindow({
      startAt: `${nextWindow.date}T${nextWindow.start}:00+03:00`,
      endAt: `${nextWindow.date}T${nextWindow.end}:00+03:00`,
    });
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

  return (
    <>
      <AdminScreenHeader
        eyebrow="окошки"
        title="Работаем, Варвара Александровна"
        actionLabel={newRequestsCount > 0 ? `К клиенткам (${newRequestsCount})` : "К клиенткам"}
        onAction={() => onNavigate("requests")}
      />

      <section className="admin-screen-stack">
        <section className="panel calendar-panel">
          <div className="section-title">
            <CalendarClock size={22} />
            <div>
              <h2>Кто и когда</h2>
            </div>
          </div>
          <div className="calendar-hint">Перетащи запись или нажми "Перенести"</div>

          {tapMoveAppointmentId ? (
            <div className="calendar-move-mode">
              Выбери свободное окошко для переноса.
              <button className="secondary-button" onClick={() => setTapMoveAppointmentId(null)} type="button">
                Отменить
              </button>
            </div>
          ) : null}

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
              onClick={submitWindow}
              type="button"
            >
              Создать окошко
            </button>
          </div>

          <div className="quick-window-row" aria-label="Быстрые окна">
            <button className="secondary-button" onClick={() => addQuickWindow("tomorrow-morning")} type="button">
              Завтра утром
            </button>
            <button className="secondary-button" onClick={() => addQuickWindow("tomorrow-evening")} type="button">
              Завтра вечер
            </button>
            <button className="secondary-button" onClick={() => addQuickWindow("weekend")} type="button">
              Выходные
            </button>
          </div>

          <div className="calendar-board">
            {windowsByDate.length === 0 ? (
              <div className="empty-state calendar-empty-state">
                <strong>Нет окошек на недельке</strong>
                <span>Добавь пару свободных мест, чтобы пополнить кошелек.</span>
                <button className="primary-button" onClick={submitWindow} type="button">
                  <Plus size={17} /> Добавить окошко
                </button>
              </div>
            ) : (
              <>
                {!hasWindowsThisWeek ? (
                  <div className="empty-state calendar-empty-state">
                    <strong>Нет окошек на неделю</strong>
                    <span>Ближайшие свободные места дальше, чем через 7 дней.</span>
                    <button className="primary-button" onClick={() => addQuickWindow("tomorrow-morning")} type="button">
                      <Plus size={17} /> Добавить окошко
                    </button>
                  </div>
                ) : null}
              {windowsByDate.map((day) => (
                <section key={day.dateKey} className="calendar-day">
                  <h3>{day.label}</h3>
                  <div className="calendar-grid">
                    {day.items.map((windowItem) => {
                      const appointment = findAppointmentForWindow(windowItem) ?? null;
                      const client = appointment
                        ? clients.find((item) => item.id === appointment.clientId)
                        : null;
                      const isFutureWindow = new Date(windowItem.startAt).getTime() >= Date.now();
                      const activeMoveAppointmentId = tapMoveAppointmentId ?? dragAppointmentId;
                      const moveConflictReason = activeMoveAppointmentId
                        ? getMoveConflictReason(windowItem, appointment, isFutureWindow)
                        : "";
                      const canDropHere =
                        Boolean(activeMoveAppointmentId) && !moveConflictReason;
                      const isDragOver = dragOverWindowId === windowItem.id && canDropHere;

                      return (
                        <article
                          key={windowItem.id}
                          className={`calendar-slot ${windowItem.status}${canDropHere ? " droppable" : ""}${isDragOver ? " drag-over" : ""}`}
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
                            setDragOverWindowId(windowItem.id);
                          }}
                          onDragLeave={() => {
                            if (dragOverWindowId === windowItem.id) {
                              setDragOverWindowId(null);
                            }
                          }}
                          onDrop={() => {
                            if (canDropHere && dragAppointmentId) {
                              scheduleMove(dragAppointmentId, windowItem.id);
                            }
                            setDragAppointmentId(null);
                            setDragOverWindowId(null);
                          }}
                          onClick={(event) => {
                            if (!tapMoveAppointmentId || appointment || moveConflictReason) {
                              return;
                            }

                            event.stopPropagation();
                            scheduleMove(tapMoveAppointmentId, windowItem.id);
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
                              label: `${client?.name ?? "Клиентка"} · ${formatTimeRange(windowItem.startAt, windowItem.endAt)}`,
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
                              const targetAppointment = targetWindow
                                ? findAppointmentForWindow(targetWindow) ?? null
                                : null;
                              const targetIsFuture = targetWindow
                                ? new Date(targetWindow.startAt).getTime() >= Date.now()
                                : false;
                              if (
                                targetWindow &&
                                !getMoveConflictReason(targetWindow, targetAppointment, targetIsFuture)
                              ) {
                                scheduleMove(dragAppointmentId, dragOverWindowId);
                              }
                            }
                            setDragAppointmentId(null);
                            setDragOverWindowId(null);
                            setDragPreview(null);
                          }}
                          data-window-id={windowItem.id}
                        >
                          <div className="slot-header">
                            <strong>{formatTimeRange(windowItem.startAt, windowItem.endAt)}</strong>
                            <span>{windowStatusLabel(windowItem.status)}</span>
                          </div>
                          {appointment ? (
                            <div className="slot-body">
                              <div>{client?.name ?? "Клиентка"}</div>
                              <small>
                                {getServiceTitle(services, appointment.service)} · {appointment.durationMinutes} мин
                              </small>
                            </div>
                          ) : (
                            <div className="slot-body">Свободно</div>
                          )}
                          <div className="slot-actions">
                            {appointment ? (
                              <div className="slot-action-stack">
                                <span className="slot-hint">Перетащи или выбери перенос.</span>
                                <button
                                  className={
                                    tapMoveAppointmentId === appointment.id ? "primary-button" : "secondary-button"
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setTapMoveAppointmentId((current) =>
                                      current === appointment.id ? null : appointment.id,
                                    );
                                  }}
                                  type="button"
                                >
                                  {tapMoveAppointmentId === appointment.id ? "Выбрано" : "Перенести"}
                                </button>
                                <button
                                  className="danger-button"
                                  onClick={() => {
                                    if (globalThis.confirm("Отменить запись?")) {
                                      updateAppointmentStatus(appointment.id, "cancelled");
                                    }
                                  }}
                                  type="button"
                                >
                                  Отменить
                                </button>
                                <button
                                  className="secondary-button"
                                  onClick={() => {
                                    if (globalThis.confirm("Удалить запись из календаря?")) {
                                      deleteAppointment(appointment.id);
                                    }
                                  }}
                                  type="button"
                                >
                                  <Trash2 size={16} /> Удалить
                                </button>
                              </div>
                            ) : windowItem.status === "available" ? (
                              moveConflictReason ? (
                                <div className="slot-conflict-note">{moveConflictReason}</div>
                              ) : tapMoveAppointmentId ? (
                                <button className="primary-button" type="button">
                                  Перенести сюда
                                </button>
                              ) : (
                                <button
                                  className="secondary-button"
                                  onClick={() => updateWindowStatus(windowItem.id, "blocked")}
                                  type="button"
                                >
                                  Закрыть
                                </button>
                              )
                            ) : windowItem.status === "blocked" ? (
                              <button
                                className="secondary-button"
                                onClick={() => updateWindowStatus(windowItem.id, "available")}
                                type="button"
                              >
                                Открыть
                              </button>
                            ) : (
                              <div className="slot-conflict-note">
                                {moveConflictReason || "Недоступно: слот уже не свободен."}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              </>
            )}
          </div>

          {pendingMove ? (
            <div className="panel notice-panel">
              Перенести запись в это окошко?
              {pendingDetails ? (
                <div className="move-details">
                  <div>Клиентка: {pendingDetails.client?.name ?? "Клиентка"}</div>
                  {pendingDetails.from ? (
                    <div>
                      Было: {formatDayLabel(pendingDetails.from.startAt)}{" "}
                      {formatTimeRange(pendingDetails.from.startAt, pendingDetails.from.endAt)}
                    </div>
                  ) : null}
                  <div>
                    Станет: {formatDayLabel(pendingDetails.to.startAt)}{" "}
                    {formatTimeRange(pendingDetails.to.startAt, pendingDetails.to.endAt)}
                  </div>
                </div>
              ) : null}
              <div className="action-row">
                <button className="primary-button" onClick={executeMove} type="button">
                  Подтвердить
                </button>
                <button className="secondary-button" onClick={() => setPendingMove(null)} type="button">
                  Отменить
                </button>
              </div>
            </div>
          ) : null}

          {dragPreview ? (
            <div className="drag-preview" style={{ left: dragPreview.x + 10, top: dragPreview.y + 10 }}>
              {dragPreview.label}
            </div>
          ) : null}
        </section>

        <section className="admin-overview-grid admin-overview-grid-compact">
          <article className="panel admin-preview-panel">
            <div className="section-inline-title">
              <strong>Ближайшие записи</strong>
            </div>
            <div className="admin-preview-list">
              {upcomingAppointments.length === 0 ? (
                <div className="empty-state">Активных записей пока нет.</div>
              ) : (
                upcomingAppointments.map((appointment) => {
                  const client = clients.find((item) => item.id === appointment.clientId);
                  return (
                    <article className="admin-preview-item" key={appointment.id}>
                      <span className="status confirmed">Запись</span>
                      <strong>
                        {client?.name ?? "Клиентка"} · {getServiceTitle(services, appointment.service)}
                      </strong>
                      <small>{formatDateTime(appointment.startAt)}</small>
                    </article>
                  );
                })
              )}
            </div>
          </article>

          <article className="panel admin-preview-panel">
            <div className="section-inline-title">
              <strong>Свободные окошки</strong>
            </div>
            <div className="admin-preview-list">
              {nextAvailableDays.length === 0 ? (
                <div className="empty-state">Все ближайшие окошки уже заняты или закрыты.</div>
              ) : (
                nextAvailableDays.map((day) => (
                  <article className="admin-preview-item" key={day.key}>
                    <strong>{day.label}</strong>
                    <small>{day.availableCount} свободных местечек</small>
                  </article>
                ))
              )}
            </div>
          </article>
        </section>
      </section>
    </>
  );
}

type QuickWindowPreset = "tomorrow-morning" | "tomorrow-evening" | "weekend";

function makeQuickWindow(preset: QuickWindowPreset) {
  const date = preset === "weekend" ? getNextWeekendDate() : addDays(new Date(), 1);
  const times: Record<QuickWindowPreset, { start: string; end: string }> = {
    "tomorrow-morning": { start: "10:00", end: "13:00" },
    "tomorrow-evening": { start: "18:00", end: "21:00" },
    weekend: { start: "11:00", end: "14:00" },
  };
  const time = times[preset];

  return {
    date: toDateInputValue(date),
    start: time.start,
    end: time.end,
  };
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getNextWeekendDate() {
  const today = new Date();
  const day = today.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7 || 7;
  return addDays(today, daysUntilSaturday);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinNextDays(value: string, days: number) {
  const time = new Date(value).getTime();
  const now = Date.now();
  return time >= now && time <= now + days * 24 * 60 * 60 * 1000;
}

function getMoveConflictReason(
  window: TimeWindow,
  appointment: MasterWorkspaceSectionProps["appointments"][number] | null,
  isFutureWindow: boolean,
) {
  if (appointment) {
    return "Тут уже стоит клиентка.";
  }

  if (!isFutureWindow) {
    return "Это окошко уже прошло.";
  }

  if (window.status === "blocked") {
    return "Окошко закрыто.";
  }

  if (window.status === "reserved") {
    return "Тут уже другая запись.";
  }

  if (window.status === "offered") {
    return "Это окошко уже предложено клиентке.";
  }

  if (window.status !== "available") {
    return "Окошко недоступно для переноса.";
  }

  return "";
}
