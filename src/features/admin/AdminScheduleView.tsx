import { useMemo, useRef, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import {
  formatDayLabel,
  formatTimeRange,
  getServiceTitle,
  groupWindowsByDate,
  windowStatusLabel,
} from "../../lib/bookingPresentation";
import {
  getTodayDateKey,
  isFutureDateTime,
  toAppDateTime,
} from "../../lib/dateTime";
import { AdminScreenHeader } from "./AdminNavigation";
import { type MasterWorkspaceSectionProps } from "./masterWorkspaceTypes";
import type { TimeWindow } from "../../types";

export function AdminScheduleView({
  appointments,
  clients,
  addTimeWindow,
  deleteTimeWindow,
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
  | "deleteTimeWindow"
  | "services"
  | "moveAppointment"
  | "updateAppointmentStatus"
  | "updateWindowStatus"
  | "windows"
>) {
  const [tapMoveAppointmentId, setTapMoveAppointmentId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ appointmentId: string; windowId: string } | null>(null);
  const [isWindowFormOpen, setIsWindowFormOpen] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const busyActionRef = useRef<string | null>(null);
  const [windowForm, setWindowForm] = useState({
    date: getTodayDateKey(),
    start: "11:00",
    end: "14:00",
  });

  const visibleWindows = useMemo(() => windows.filter((window) => isFutureDateTime(window.endAt)), [windows]);
  const windowsByDate = useMemo(() => groupWindowsByDate(visibleWindows), [visibleWindows]);

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

  const runScheduleAction = async <T,>(key: string, action: () => T | Promise<T>) => {
    if (busyActionRef.current) {
      return null;
    }

    busyActionRef.current = key;
    setBusyActionKey(key);
    try {
      return await action();
    } finally {
      busyActionRef.current = null;
      setBusyActionKey(null);
    }
  };

  const executeMove = async () => {
    if (!pendingMove) {
      return;
    }

    const result = await runScheduleAction(`move:${pendingMove.appointmentId}:${pendingMove.windowId}`, () =>
      moveAppointment(pendingMove.appointmentId, pendingMove.windowId),
    );
    if (result !== false) {
      setPendingMove(null);
    }
  };

  const submitWindow = async () => {
    if (!windowForm.date || !windowForm.start || !windowForm.end) {
      return;
    }

    const result = await runScheduleAction("window:create", () => addTimeWindow({
      startAt: toAppDateTime(windowForm.date, windowForm.start),
      endAt: toAppDateTime(windowForm.date, windowForm.end),
    }));
    if (result !== false) {
      setIsWindowFormOpen(false);
    }
  };

  const pendingDetails = pendingMove
    ? (() => {
        const appointment = appointments.find((item) => item.id === pendingMove.appointmentId);
        const targetWindow = visibleWindows.find((item) => item.id === pendingMove.windowId);

        if (!appointment || !targetWindow) {
          return null;
        }

        const oldWindow = visibleWindows.find(
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
        title="Окошки для записи"
      />

      <section className="admin-screen-stack">
        <section className="panel calendar-panel">
          <div className="calendar-panel-title">
            <span className="calendar-panel-icon">
              <CalendarClock size={21} />
            </span>
            <div>
              <h2>Расписание</h2>
            </div>
            {!isWindowFormOpen ? (
              <button className="primary-button calendar-add-button" onClick={() => setIsWindowFormOpen(true)} type="button">
                <Plus size={17} /> Добавить окно
              </button>
            ) : null}
          </div>

          {tapMoveAppointmentId ? (
            <div className="calendar-move-mode">
              Выбери свободное окошко для переноса.
              <button className="ghost-button" onClick={() => setTapMoveAppointmentId(null)} type="button">
                Отменить
              </button>
            </div>
          ) : null}

          {isWindowFormOpen ? (
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
              <div className="calendar-toolbar-actions">
                <button
                  className="ghost-button"
                  disabled={Boolean(busyActionKey)}
                  onClick={() => setIsWindowFormOpen(false)}
                  type="button"
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  disabled={Boolean(busyActionKey)}
                  onClick={() => void submitWindow()}
                  type="button"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : null}

          <div className="calendar-board">
            {windowsByDate.length === 0 ? (
              <div className="empty-state calendar-empty-state">
                <strong>Нет окошек на ближайшие дни</strong>
              </div>
            ) : (
              <>
              {windowsByDate.map((day) => (
                <section key={day.dateKey} className="calendar-day">
                  <div className="calendar-day-header">
                    <h3>{day.label}</h3>
                    <span>{day.items.length}</span>
                  </div>
                  <div className="calendar-grid">
                    {day.items.map((windowItem) => {
                      const appointment = findAppointmentForWindow(windowItem) ?? null;
                      const client = appointment
                        ? clients.find((item) => item.id === appointment.clientId)
                        : null;
                      const isFutureWindow = isFutureDateTime(windowItem.startAt);
                      const canMoveAppointment = appointment ? isFutureDateTime(appointment.startAt) : false;
                      const moveConflictReason = tapMoveAppointmentId
                        ? getMoveConflictReason(windowItem, appointment, isFutureWindow)
                        : "";
                      const canDropHere =
                        Boolean(tapMoveAppointmentId) && !moveConflictReason;

                      return (
                        <article
                          key={windowItem.id}
                          className={`calendar-slot ${windowItem.status}${canDropHere ? " droppable" : ""}`}
                          onClick={(event) => {
                            if (!tapMoveAppointmentId || appointment || moveConflictReason) {
                              return;
                            }

                            event.stopPropagation();
                            scheduleMove(tapMoveAppointmentId, windowItem.id);
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
                            <div className="slot-body">{getEmptyWindowText(windowItem.status)}</div>
                          )}
                          <div className="slot-actions">
                            {appointment ? (
                              <div className="slot-action-stack">
                                {canMoveAppointment ? (
                                  <button
                                    className={
                                      tapMoveAppointmentId === appointment.id ? "primary-button" : "secondary-button"
                                    }
                                    disabled={Boolean(busyActionKey)}
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
                                ) : null}
                                <button
                                  className="danger-button"
                                  disabled={Boolean(busyActionKey)}
                                  onClick={() => {
                                    if (globalThis.confirm("Отменить запись?")) {
                                      void runScheduleAction(`appointment:${appointment.id}:cancel`, () =>
                                        updateAppointmentStatus(appointment.id, "cancelled"),
                                      );
                                    }
                                  }}
                                  type="button"
                                >
                                  Отменить
                                </button>
                              </div>
                            ) : tapMoveAppointmentId ? (
                              moveConflictReason ? (
                                <div className="slot-conflict-note">{moveConflictReason}</div>
                              ) : (
                                <button
                                  className="primary-button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    scheduleMove(tapMoveAppointmentId, windowItem.id);
                                  }}
                                  type="button"
                                >
                                  Сюда
                                </button>
                              )
                            ) : windowItem.status === "available" ? (
                              <button
                                className="secondary-button"
                                disabled={Boolean(busyActionKey)}
                                onClick={() =>
                                  void runScheduleAction(`window:${windowItem.id}:blocked`, () =>
                                    updateWindowStatus(windowItem.id, "blocked"),
                                  )
                                }
                                type="button"
                              >
                                Закрыть
                              </button>
                            ) : windowItem.status === "blocked" ? (
                              <div className="slot-action-stack">
                                {isFutureWindow ? (
                                  <button
                                    className="secondary-button"
                                    disabled={Boolean(busyActionKey)}
                                    onClick={() =>
                                      void runScheduleAction(`window:${windowItem.id}:available`, () =>
                                        updateWindowStatus(windowItem.id, "available"),
                                      )
                                    }
                                    type="button"
                                  >
                                    Открыть
                                  </button>
                                ) : (
                                  <div className="slot-conflict-note">Окошко уже началось.</div>
                                )}
                                <button
                                  className="danger-button"
                                  disabled={Boolean(busyActionKey)}
                                  onClick={() => {
                                    if (globalThis.confirm("Удалить это окошко?")) {
                                      void runScheduleAction(`window:${windowItem.id}:delete`, () =>
                                        deleteTimeWindow(windowItem.id),
                                      );
                                    }
                                  }}
                                  type="button"
                                >
                                  Удалить
                                </button>
                              </div>
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
                <button className="primary-button" disabled={Boolean(busyActionKey)} onClick={executeMove} type="button">
                  Подтвердить
                </button>
                <button className="ghost-button" disabled={Boolean(busyActionKey)} onClick={() => setPendingMove(null)} type="button">
                  Отменить
                </button>
              </div>
            </div>
          ) : null}

        </section>
      </section>
    </>
  );
}

function getEmptyWindowText(status: TimeWindow["status"]) {
  if (status === "blocked") {
    return "Закрыто";
  }

  if (status === "offered") {
    return "Ждёт ответа";
  }

  return "Свободно";
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
