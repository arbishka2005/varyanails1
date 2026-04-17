import { useEffect, useState } from "react";
import { CalendarClock, Plus, Settings, Trash2 } from "lucide-react";
import { windowStatusLabel } from "../../lib/bookingPresentation";
import { AdminScreenHeader } from "./AdminNavigation";
import { makeServiceId, parseServiceEditor, toServiceEditorState, type ServiceEditorState } from "./serviceEditor";
import type { ServiceKind, ServicePreset, TimeWindow, TimeWindowStatus } from "../../types";

export function SettingsWorkspace({
  services,
  windows,
  addTimeWindow,
  createService,
  updateService,
  deleteService,
  updateWindowStatus,
}: {
  services: ServicePreset[];
  windows: TimeWindow[];
  addTimeWindow: (window: Omit<TimeWindow, "id" | "label" | "status">) => void;
  createService: (service: ServicePreset) => void;
  updateService: (id: ServiceKind, patch: Partial<ServicePreset>) => void;
  deleteService: (id: ServiceKind) => void;
  updateWindowStatus: (id: string, status: TimeWindowStatus) => void;
}) {
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, ServiceEditorState>>({});
  const [createForm, setCreateForm] = useState<ServiceEditorState>({
    title: "",
    durationMinutes: "120",
    priceFrom: "",
    requiresHandPhoto: false,
    requiresReference: true,
  });
  const [serviceError, setServiceError] = useState<string | null>(null);
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

  return (
    <section className="settings-layout">
      <AdminScreenHeader
        eyebrow="прайс"
        title="Прайс и окошки"
      />

      <div className="panel settings-panel">
        <div className="section-title section-title-compact">
          <Settings size={22} />
          <div>
            <h2>Процедуры</h2>
          </div>
        </div>

        <article className="settings-item settings-create-card">
          <div className="settings-item-header">
            <div>
              <h3>Новая услужка</h3>
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
                  <small>Чтобы точнее понять дизайн.</small>
                </span>
              </label>
            </div>
          </div>
        </article>

        {serviceError ? (
          <p className="error-text" role="alert">
            {serviceError}
          </p>
        ) : null}

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
                  </span>
                </label>
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
      </div>

      <aside className="panel settings-panel">
        <div className="section-title section-title-compact">
          <CalendarClock size={22} />
          <div>
            <h2>Окошки</h2>
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
                <button className="secondary-button" disabled type="button">
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
