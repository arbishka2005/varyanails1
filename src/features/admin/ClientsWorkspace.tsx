import { useEffect, useMemo, useState } from "react";
import { CalendarClock, History, MessageCircle, Phone, Trash2 } from "lucide-react";
import { Info } from "../../components/Info";
import { PhotoGallery, PhotoLightbox } from "../../components/PhotoGallery";
import {
  appointmentStatusLabels,
  contactLabels,
  formatDateTime,
  getServiceTitle,
  statusLabels,
} from "../../lib/bookingPresentation";
import {
  clientMemoryTags,
  getClientMemoryLabels,
  parseClientMemory,
  serializeClientMemory,
  type ClientMemoryTagId,
} from "./clientMemory";
import { AdminScreenHeader } from "./AdminNavigation";
import type {
  AppSnapshot,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
  ServicePreset,
} from "../../types";

type ClientStatusFilter = RequestStatus | "all";

export function ClientsWorkspace({
  appointments,
  clients,
  photos,
  requests,
  services,
  deleteClient,
  deleteAppointment,
  updateClientNotes,
}: {
  appointments: AppSnapshot["appointments"];
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  services: ServicePreset[];
  deleteClient: (id: string) => void;
  deleteAppointment: (id: string) => void;
  updateClientNotes: (id: string, notes: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("all");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAttachment | null>(null);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru-RU");

  const clientRows = useMemo(
    () =>
      clients.map((client) => {
        const clientRequests = requests.filter((request) => request.clientId === client.id);
        const clientAppointments = appointments.filter((appointment) => appointment.clientId === client.id);
        const clientPhotoIds = new Set(clientRequests.flatMap((request) => request.photoIds));
        const clientPhotos = photos.filter((photo) => clientPhotoIds.has(photo.id));
        const latestRequest = clientRequests[0];
        const memory = parseClientMemory(client.notes);

        return { client, clientRequests, clientAppointments, clientPhotos, latestRequest, memory };
      }),
    [appointments, clients, photos, requests],
  );

  const filteredClientRows = useMemo(
    () =>
      clientRows.filter(({ client, clientRequests, latestRequest, memory }) => {
        const matchesStatus = statusFilter === "all" || latestRequest?.status === statusFilter;
        const searchableText = [
          client.name,
          client.phone,
          client.contactHandle,
          memory.note,
          ...getClientMemoryLabels(memory),
          client.id,
          contactLabels[client.preferredContactChannel],
          ...clientRequests.flatMap((request) => [
            request.id,
            getServiceTitle(services, request.service),
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
    [clientRows, normalizedQuery, services, statusFilter],
  );

  const hasActiveFilters = Boolean(normalizedQuery) || statusFilter !== "all";

  const handleDeleteClient = (client: Client) => {
    const confirmed = window.confirm(
      `Удалить клиента ${client.name} из истории? Вместе с ним удалятся заявки, записи и привязанные фото.`,
    );

    if (!confirmed) {
      return;
    }

    deleteClient(client.id);
  };

  const handleDeleteAppointment = (appointmentId: string) => {
    const confirmed = window.confirm("Удалить эту запись из истории и освободить слот?");

    if (!confirmed) {
      return;
    }

    deleteAppointment(appointmentId);
  };

  return (
    <section className="clients-layout">
      <AdminScreenHeader
        eyebrow="база"
        title="Твояшкины"
        description="Контакты, история и заметки"
      />

      <div className="panel client-filters">
        <label>
          Найти клиентку
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Имя, телефон, ник, услуга или заметка"
            type="search"
          />
        </label>
        <label>
          Последний статус
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ClientStatusFilter)}>
            <option value="all">Все клиентки</option>
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
            type="button"
          >
            Сбросить
          </button>
        </div>
      </div>

      <div className="client-card-grid">
        {filteredClientRows.length === 0 ? (
          <div className="empty-state">По этим фильтрам клиенток не найдено.</div>
        ) : (
          filteredClientRows.map(({ client, clientRequests, clientAppointments, clientPhotos, latestRequest, memory }) => (
            <article className="panel client-card" key={client.id}>
              <div className="card-header">
                <div>
                  <span className="status">{client.firstVisit ? "Первый визит" : "Постоянная клиентка"}</span>
                  <h3>{client.name}</h3>
                </div>
                <div className="client-card-actions">
                  <span className="request-id">{client.id}</span>
                  <button className="danger-button" onClick={() => handleDeleteClient(client)} type="button">
                    <Trash2 size={16} /> Удалить
                  </button>
                </div>
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
                <Info
                  label="Последняя услуга"
                  value={latestRequest ? getServiceTitle(services, latestRequest.service) : "Еще нет"}
                />
                <Info
                  label="Последний статус"
                  value={latestRequest ? statusLabels[latestRequest.status] : "Еще нет"}
                />
              </div>

              <ClientMemoryPanel client={client} memory={memory} updateClientNotes={updateClientNotes} />

              <div className="client-history">
                <strong>
                  <CalendarClock size={16} /> Записи
                </strong>
                {clientAppointments.length === 0 ? (
                  <p>Подтвержденных записей пока нет.</p>
                ) : (
                  clientAppointments.map((appointment) => (
                    <div className="history-item history-item-with-action" key={appointment.id}>
                      <div className="history-item-copy">
                        <span>
                          {getServiceTitle(services, appointment.service)} · {appointmentStatusLabels[appointment.status]}
                        </span>
                        <small>
                          {formatDateTime(appointment.startAt)} · {appointment.durationMinutes} мин
                        </small>
                      </div>
                      <button
                        className="secondary-button history-item-button"
                        onClick={() => handleDeleteAppointment(appointment.id)}
                        type="button"
                      >
                        <Trash2 size={16} /> Удалить
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="client-history">
                <strong>
                  <History size={16} /> История
                </strong>
                {clientRequests.length === 0 ? (
                  <p>Заявок пока нет.</p>
                ) : (
                  clientRequests.map((request) => (
                    <div className="history-item" key={request.id}>
                      <span>{getServiceTitle(services, request.service)} · {statusLabels[request.status]}</span>
                      <small>{formatDateTime(request.createdAt)} · {request.estimatedMinutes} мин</small>
                    </div>
                  ))
                )}
              </div>

              <div className="client-history">
                <strong>Фото</strong>
                {clientPhotos.length === 0 ? <p>Фото пока не приложены.</p> : <PhotoGallery photos={clientPhotos} onOpen={setSelectedPhoto} />}
              </div>
            </article>
          ))
        )}
      </div>
      <PhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </section>
  );
}

function ClientMemoryPanel({
  client,
  memory,
  updateClientNotes,
}: {
  client: Client;
  memory: ReturnType<typeof parseClientMemory>;
  updateClientNotes: (id: string, notes: string) => void;
}) {
  const [draft, setDraft] = useState(memory);

  useEffect(() => {
    setDraft(memory);
  }, [memory]);

  const saveMemory = (nextMemory: typeof memory) => {
    setDraft(nextMemory);
    updateClientNotes(client.id, serializeClientMemory(nextMemory));
  };

  const toggleTag = (tagId: ClientMemoryTagId) => {
    const nextTagIds = draft.tagIds.includes(tagId)
      ? draft.tagIds.filter((id) => id !== tagId)
      : [...draft.tagIds, tagId];

    saveMemory({ ...draft, tagIds: nextTagIds });
  };

  return (
    <section className="client-memory-panel">
      <div className="section-inline-title">
        <strong>Память мастера</strong>
        <span>то, что важно вспомнить перед визитом</span>
      </div>

      <div className="client-memory-tags" aria-label="Быстрые заметки о клиентке">
        {clientMemoryTags.map((tag) => (
          <button
            className={draft.tagIds.includes(tag.id) ? "active" : ""}
            key={tag.id}
            onClick={() => toggleTag(tag.id)}
            type="button"
          >
            {tag.label}
          </button>
        ))}
      </div>

      <label>
        Короткая заметка
      <textarea
          value={draft.note}
          onBlur={() => saveMemory(draft)}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
          placeholder="Например: любит мягкий квадрат, не переносит кислотные оттенки, лучше писать вечером."
      />
      </label>
    </section>
  );
}
