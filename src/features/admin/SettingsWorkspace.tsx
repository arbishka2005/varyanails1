import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, RotateCcw, Settings, Trash2 } from "lucide-react";
import { AdminScreenHeader } from "./AdminNavigation";
import { makeServiceId, parseServiceEditor, toServiceEditorState, type ServiceEditorState } from "./serviceEditor";
import type { Appointment, BookingRequest, ServiceKind, ServicePreset } from "../../types";

export function SettingsWorkspace({
  appointments,
  requests,
  services,
  createService,
  updateService,
  deleteService,
}: {
  appointments: Appointment[];
  requests: BookingRequest[];
  services: ServicePreset[];
  createService: (service: ServicePreset) => void;
  updateService: (
    id: ServiceKind,
    patch: Omit<Partial<ServicePreset>, "priceFrom"> & { priceFrom?: number | null },
  ) => void;
  deleteService: (id: ServiceKind) => void;
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
  const [serviceWarning, setServiceWarning] = useState<string | null>(null);

  const serviceUsage = useMemo(() => {
    const usage = new Map<string, { requests: number; appointments: number }>();

    for (const service of services) {
      usage.set(service.id, { requests: 0, appointments: 0 });
    }

    for (const request of requests) {
      const current = usage.get(request.service) ?? { requests: 0, appointments: 0 };
      usage.set(request.service, { ...current, requests: current.requests + 1 });
    }

    for (const appointment of appointments) {
      const current = usage.get(appointment.service) ?? { requests: 0, appointments: 0 };
      usage.set(appointment.service, { ...current, appointments: current.appointments + 1 });
    }

    return usage;
  }, [appointments, requests, services]);

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

  const submitCreateService = () => {
    const parsed = parseServiceEditor(
      createForm,
      makeServiceId(createForm.title, services.map((service) => service.id)),
    );

    if (!parsed) {
      setServiceError("Заполните название, длительность от 15 до 600 минут и корректную цену.");
      return;
    }

    setServiceError(null);
    setServiceWarning(parsed.warning ?? null);
    createService({
      ...parsed.service,
      priceFrom: parsed.service.priceFrom ?? undefined,
    });
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
      setServiceError("У услуги должны быть название, длительность от 15 до 600 минут и корректная цена.");
      return;
    }

    const original = services.find((service) => service.id === serviceId);
    const usage = serviceUsage.get(serviceId);
    const isUsed = Boolean((usage?.requests ?? 0) + (usage?.appointments ?? 0));
    const durationChanged = original ? original.durationMinutes !== parsed.service.durationMinutes : false;

    setServiceError(null);
    setServiceWarning(
      parsed.warning ??
        (isUsed && durationChanged
          ? "Длительность изменится для новых записей. История останется как была."
          : null),
    );
    updateService(serviceId, parsed.service);
  };

  const resetService = (service: ServicePreset) => {
    setServiceDrafts((current) => ({
      ...current,
      [service.id]: toServiceEditorState(service),
    }));
  };

  const removeService = (serviceId: ServiceKind) => {
    const usage = serviceUsage.get(serviceId);
    const usedCount = (usage?.requests ?? 0) + (usage?.appointments ?? 0);

    if (services.length <= 1) {
      setServiceError("Нужна хотя бы одна услуга, чтобы онлайн-запись продолжала работать.");
      return;
    }

    if (usedCount > 0) {
      setServiceError("Эта услуга уже есть в истории. Удаление отключено, чтобы не ломать прошлые записи.");
      return;
    }

    setServiceError(null);
    deleteService(serviceId);
  };

  return (
    <section className="settings-layout">
      <AdminScreenHeader
        eyebrow="прайс"
        title="Услуги и правила записи"
      />

      <div className="panel settings-panel">
        <div className="section-title section-title-compact">
          <Settings size={22} />
          <div>
            <h2>Прайс</h2>
          </div>
        </div>

        <article className="settings-item settings-create-card">
          <div className="settings-item-header">
            <div>
              <h3>Новая услуга</h3>
            </div>
            <button className="primary-button" onClick={submitCreateService} type="button">
              <Plus size={17} /> Добавить
            </button>
          </div>

          <ServiceEditorFields
            draft={createForm}
            onChange={(patch) => setCreateForm((current) => ({ ...current, ...patch }))}
          />
        </article>

        {serviceError ? (
          <p className="error-text" role="alert">
            {serviceError}
          </p>
        ) : null}

        {serviceWarning ? (
          <div className="notice-inline" role="status">
            <AlertTriangle size={16} /> {serviceWarning}
          </div>
        ) : null}

        <div className="settings-list">
          {services.map((service) => {
            const usage = serviceUsage.get(service.id) ?? { requests: 0, appointments: 0 };
            const usedCount = usage.requests + usage.appointments;
            const draft = serviceDrafts[service.id] ?? toServiceEditorState(service);

            return (
              <article className="settings-item" key={service.id}>
                <div className="settings-item-header">
                  <div>
                    <h3>{service.title}</h3>
                    <p className="settings-meta">
                      {usedCount > 0 ? `В истории ${usedCount}` : "Ещё не использовалась"}
                    </p>
                  </div>

                  <button
                    className="danger-button settings-delete-button"
                    disabled={services.length <= 1 || usedCount > 0}
                    aria-label={`Удалить услугу ${service.title}`}
                    title="Удалить услугу"
                    onClick={() => removeService(service.id)}
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                {usedCount > 0 ? (
                  <div className="notice-inline">
                    <AlertTriangle size={16} /> Услуга уже есть в истории.
                  </div>
                ) : null}

                <ServiceEditorFields draft={draft} onChange={(patch) => updateDraft(service.id, patch)} />

                <div className="settings-actions">
                  <button className="ghost-button" onClick={() => resetService(service)} type="button">
                    <RotateCcw size={16} /> Отменить
                  </button>
                  <button className="primary-button" onClick={() => saveService(service.id)} type="button">
                    Сохранить
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ServiceEditorFields({
  draft,
  onChange,
}: {
  draft: ServiceEditorState;
  onChange: (patch: Partial<ServiceEditorState>) => void;
}) {
  return (
    <>
      <div className="field-row">
        <label>
          Название
          <input
            type="text"
            value={draft.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="Например, покрытие с дизайном"
            maxLength={80}
          />
        </label>
        <label>
          Цена от, ₽
          <input
            type="number"
            min="0"
            max="1000000"
            value={draft.priceFrom}
            onChange={(event) => onChange({ priceFrom: event.target.value })}
            placeholder="0"
          />
        </label>
      </div>

      <div className="field-row settings-grid-balanced">
        <label>
          Длительность, мин
          <input
            type="number"
            min="15"
            max="600"
            step="15"
            value={draft.durationMinutes}
            onChange={(event) => onChange({ durationMinutes: event.target.value })}
          />
        </label>

        <div className="settings-flags compact">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={draft.requiresHandPhoto}
              onChange={(event) => onChange({ requiresHandPhoto: event.target.checked })}
            />
            <span className="checkbox-copy">
              <strong>Фото рук</strong>
            </span>
          </label>

          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={draft.requiresReference}
              onChange={(event) => onChange({ requiresReference: event.target.checked })}
            />
            <span className="checkbox-copy">
              <strong>Референс</strong>
            </span>
          </label>
        </div>
      </div>
    </>
  );
}
