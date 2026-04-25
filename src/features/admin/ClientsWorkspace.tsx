import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, CalendarClock, History, MessageCircle, Phone } from "lucide-react";
import { Info } from "../../components/Info";
import { PhotoGallery, PhotoLightbox } from "../../components/PhotoGallery";
import {
  appointmentStatusLabels,
  contactLabels,
  formatDateTime,
  getServiceTitle,
  statusLabels,
} from "../../lib/bookingPresentation";
import { compareDateTimeDesc } from "../../lib/dateTime";
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

type ClientRow = {
  client: Client;
  clientRequests: BookingRequest[];
  clientAppointments: AppSnapshot["appointments"];
  clientPhotos: PhotoAttachment[];
  latestRequest: BookingRequest | null;
  latestActivityAt: string;
  memory: ReturnType<typeof parseClientMemory>;
  hasActiveAppointment: boolean;
  hasDuplicateContact: boolean;
};

function safeText(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized || fallback;
}

function safeFormatDateTime(value: string | undefined) {
  if (!value) {
    return "дата не указана";
  }

  try {
    return formatDateTime(value);
  } catch {
    return "дата не читается";
  }
}

function normalizeContact(value: string | undefined) {
  return value?.replace(/[\s()\-+@]/g, "").toLocaleLowerCase("ru-RU") ?? "";
}

function sortByCreatedAtDesc(left: BookingRequest, right: BookingRequest) {
  return compareDateTimeDesc(left.createdAt, right.createdAt);
}

function sortAppointmentsDesc(
  left: AppSnapshot["appointments"][number],
  right: AppSnapshot["appointments"][number],
) {
  return compareDateTimeDesc(left.startAt, right.startAt);
}

function sortByLatestActivityDesc(left: ClientRow, right: ClientRow) {
  if (!left.latestActivityAt && !right.latestActivityAt) {
    return 0;
  }

  if (!left.latestActivityAt) {
    return 1;
  }

  if (!right.latestActivityAt) {
    return -1;
  }

  return compareDateTimeDesc(left.latestActivityAt, right.latestActivityAt);
}

export function ClientsWorkspace({
  appointments,
  clients,
  photos,
  requests,
  services,
  deleteClient,
  updateClientNotes,
}: {
  appointments: AppSnapshot["appointments"];
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  services: ServicePreset[];
  deleteClient: (id: string) => void;
  updateClientNotes: (id: string, notes: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("all");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAttachment | null>(null);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru-RU");

  const duplicateContactKeys = useMemo(() => {
    const counts = new Map<string, number>();

    for (const client of clients.filter((item) => !item.archivedAt)) {
      const phoneKey = normalizeContact(client.phone);
      const handleKey = normalizeContact(client.contactHandle);

      if (phoneKey) {
        counts.set(`phone:${phoneKey}`, (counts.get(`phone:${phoneKey}`) ?? 0) + 1);
      }

      if (handleKey) {
        counts.set(`handle:${handleKey}`, (counts.get(`handle:${handleKey}`) ?? 0) + 1);
      }
    }

    return counts;
  }, [clients]);

  const clientRows = useMemo<ClientRow[]>(
    () =>
      clients
        .filter((client) => !client.archivedAt)
        .map((client) => {
          const clientRequests = requests
            .filter((request) => request.clientId === client.id)
            .slice()
            .sort(sortByCreatedAtDesc);
          const clientAppointments = appointments
            .filter((appointment) => appointment.clientId === client.id)
            .slice()
            .sort(sortAppointmentsDesc);
          const clientPhotoIds = new Set(clientRequests.flatMap((request) => request.photoIds ?? []));
          const clientPhotos = photos.filter((photo) => clientPhotoIds.has(photo.id));
          const latestRequest = clientRequests[0] ?? null;
          const latestAppointment = clientAppointments[0] ?? null;
          const memory = parseClientMemory(client.notes);
          const phoneKey = normalizeContact(client.phone);
          const handleKey = normalizeContact(client.contactHandle);
          const hasDuplicateContact =
            Boolean(phoneKey && (duplicateContactKeys.get(`phone:${phoneKey}`) ?? 0) > 1) ||
            Boolean(handleKey && (duplicateContactKeys.get(`handle:${handleKey}`) ?? 0) > 1);
          const latestActivityAt = latestAppointment?.startAt ?? latestRequest?.createdAt ?? "";

          return {
            client,
            clientRequests,
            clientAppointments,
            clientPhotos,
            latestRequest,
            latestActivityAt,
            memory,
            hasActiveAppointment: clientAppointments.some((appointment) => appointment.status === "scheduled"),
            hasDuplicateContact,
          };
        })
        .sort(sortByLatestActivityDesc),
    [appointments, clients, duplicateContactKeys, photos, requests],
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

  const archivedCount = clients.filter((client) => client.archivedAt).length;
  const hasActiveFilters = Boolean(normalizedQuery) || statusFilter !== "all";

  const handleArchiveClient = (row: ClientRow) => {
    const activeWarning = row.hasActiveAppointment
      ? "\n\nУ клиентки есть активная запись. Запись останется в расписании, но профиль уйдёт из рабочей базы."
      : "";
    const confirmed = window.confirm(
      `Архивировать клиентку ${safeText(row.client.name, "без имени")}? История заявок, записей и фото сохранится.${activeWarning}`,
    );

    if (!confirmed) {
      return;
    }

    deleteClient(row.client.id);
  };

  return (
    <section className="clients-layout">
      <AdminScreenHeader
        eyebrow="клиентки"
        title="База клиенток"
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
          Последний статус заявки
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ClientStatusFilter)}>
            <option value="all">Все активные</option>
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
            {archivedCount > 0 ? ` · в архиве ${archivedCount}` : ""}
          </span>
          <button
            className="ghost-button"
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
          <div className="empty-state">По этим фильтрам активных клиенток не найдено.</div>
        ) : (
          filteredClientRows.map((row) => {
            const { client, clientRequests, clientAppointments, clientPhotos, latestRequest, memory } = row;
            const displayName = safeText(client.name, "Без имени");
            const contactHandle = safeText(client.contactHandle, "не указан");

            return (
              <article className="panel client-card" key={client.id}>
                <div className="card-header">
                  <div>
                    <span className="status">{client.firstVisit ? "Первый визит" : "Постоянная клиентка"}</span>
                    <h3>{displayName}</h3>
                  </div>
                  <div className="client-card-actions">
                    <span className="request-id">{client.id}</span>
                    <button className="danger-button" onClick={() => handleArchiveClient(row)} type="button">
                      <Archive size={16} /> Архивировать
                    </button>
                  </div>
                </div>

                {row.hasDuplicateContact ? (
                  <div className="notice-inline">
                    <AlertTriangle size={16} /> Похоже, есть дубль по телефону или нику.
                  </div>
                ) : null}

                <div className="info-grid">
                  <Info icon={<Phone size={16} />} label="Телефон" value={safeText(client.phone, "не указан")} />
                  <Info
                    icon={<MessageCircle size={16} />}
                    label="Связь"
                    value={`${contactLabels[client.preferredContactChannel] ?? "Контакт"} ${contactHandle}`}
                  />
                  <Info label="Заявки" value={String(clientRequests.length)} />
                  <Info label="Записи" value={String(clientAppointments.length)} />
                  <Info
                    label="Последняя услуга"
                    value={latestRequest ? getServiceTitle(services, latestRequest.service) : "Пока нет"}
                  />
                  <Info
                    label="Последний статус"
                    value={latestRequest ? statusLabels[latestRequest.status] : "Пока нет"}
                  />
                </div>

                <ClientMemoryPanel client={client} memory={memory} updateClientNotes={updateClientNotes} />

                <div className="client-history">
                  <strong>
                    <CalendarClock size={16} /> Записи
                  </strong>
                  {clientAppointments.length === 0 ? (
                    <p>Подтверждённых записей пока нет.</p>
                  ) : (
                    clientAppointments.map((appointment) => (
                      <div className="history-item" key={appointment.id}>
                        <span>
                          {getServiceTitle(services, appointment.service)} · {appointmentStatusLabels[appointment.status]}
                        </span>
                        <small>
                          {safeFormatDateTime(appointment.startAt)} · {appointment.durationMinutes} мин
                        </small>
                      </div>
                    ))
                  )}
                </div>

                <div className="client-history">
                  <strong>
                    <History size={16} /> Заявки
                  </strong>
                  {clientRequests.length === 0 ? (
                    <p>Заявок пока нет.</p>
                  ) : (
                    clientRequests.map((request) => (
                      <div className="history-item" key={request.id}>
                        <span>{getServiceTitle(services, request.service)} · {statusLabels[request.status]}</span>
                        <small>{safeFormatDateTime(request.createdAt)} · {request.estimatedMinutes} мин</small>
                      </div>
                    ))
                  )}
                </div>

                <div className="client-history">
                  <strong>Фото</strong>
                  {clientPhotos.length === 0 ? (
                    <p>Фото пока не приложены.</p>
                  ) : (
                    <PhotoGallery photos={clientPhotos} onOpen={setSelectedPhoto} />
                  )}
                </div>
              </article>
            );
          })
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
        <span>что важно вспомнить перед визитом</span>
      </div>

      {draft.warning ? (
        <div className="notice-inline">
          <AlertTriangle size={16} /> {draft.warning}
        </div>
      ) : null}

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
          placeholder="Например: любит мягкий квадрат, лучше писать вечером."
        />
      </label>
    </section>
  );
}
