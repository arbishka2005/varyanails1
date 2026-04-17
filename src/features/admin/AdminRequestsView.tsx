import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { groupWindowsByDate } from "../../lib/bookingPresentation";
import { AdminScreenHeader } from "./AdminNavigation";
import { RequestCard } from "./RequestCard";
import { type MasterWorkspaceSectionProps } from "./masterWorkspaceTypes";
import type { BookingRequest, TimeWindow } from "../../types";

export function AdminRequestsView({
  appointments,
  clients,
  confirmRequest,
  onNavigate,
  photos,
  requests,
  services,
  updateStatus,
  updateWindow,
  windows,
}: Pick<
  MasterWorkspaceSectionProps,
  | "appointments"
  | "clients"
  | "confirmRequest"
  | "onNavigate"
  | "photos"
  | "requests"
  | "services"
  | "updateStatus"
  | "updateWindow"
  | "windows"
>) {
  const newRequestsCount = requests.filter((request) => request.status === "new").length;
  const scheduledCount = appointments.filter((appointment) => appointment.status === "scheduled").length;
  const availableWindowsCount = windows.filter((window) => window.status === "available").length;
  const activeClientsCount = clients.length;

  const nextAvailableDays = useMemo(
    () =>
      groupWindowsByDate(windows)
        .map((day) => ({
          key: day.dateKey,
          label: day.label,
          availableCount: day.items.filter(
            (window) => window.status === "available" && new Date(window.startAt).getTime() >= Date.now(),
          ).length,
        }))
        .filter((day) => day.availableCount > 0)
        .slice(0, 4),
    [windows],
  );

  const inboxGroups = useMemo(() => buildInboxGroups(requests, windows), [requests, windows]);
  const inboxCount = inboxGroups.reduce((sum, group) => sum + group.requests.length, 0);

  return (
    <>
      <AdminScreenHeader
        eyebrow="заявки"
        title="Кто ждёт ответа"
      />

      <section className="admin-screen-stack">
        <section className="requests-stack admin-inbox-stack">
          <div className="section-title">
            <ClipboardList size={22} />
            <div>
              <h2>Нужно разобрать</h2>
            </div>
          </div>

          {inboxCount === 0 ? (
            <div className="empty-state">Пока никто не ждёт ответа.</div>
          ) : (
            inboxGroups.map((group) =>
              group.requests.length > 0 ? (
                <section className="admin-inbox-group" key={group.id}>
                  <div className="admin-inbox-group-header">
                    <span>{group.title}</span>
                    <strong>{group.requests.length}</strong>
                  </div>

                  <div className="admin-inbox-list">
                    {group.requests.map((request) => (
                      <RequestCard
                        key={request.id}
                        client={clients.find((client) => client.id === request.clientId)}
                        photos={photos.filter((photo) => request.photoIds.includes(photo.id))}
                        request={request}
                        services={services}
                        windows={windows}
                        confirmRequest={confirmRequest}
                        updateStatus={updateStatus}
                        updateWindow={updateWindow}
                      />
                    ))}
                  </div>
                </section>
              ) : null,
            )
          )}
        </section>

        <section className="admin-overview-grid admin-overview-grid-compact">
          <article className="panel admin-preview-panel">
            <div className="section-inline-title">
              <strong>Сводочка</strong>
            </div>
            <div className="admin-mini-stats">
              <div className="admin-mini-stat">
                <span>Новенькие</span>
                <strong>{newRequestsCount}</strong>
              </div>
              <div className="admin-mini-stat">
                <span>Записи</span>
                <strong>{scheduledCount}</strong>
              </div>
              <div className="admin-mini-stat">
                <span>Окошки</span>
                <strong>{availableWindowsCount}</strong>
              </div>
              <div className="admin-mini-stat">
                <span>Клиентки</span>
                <strong>{activeClientsCount}</strong>
              </div>
            </div>
          </article>

          <article className="panel admin-preview-panel">
            <div className="section-inline-title">
              <strong>Куда можно поставить</strong>
            </div>
            <div className="admin-preview-list">
              {nextAvailableDays.length === 0 ? (
                <div className="empty-state">Свободных окошек нет. Надо открыть парочку.</div>
              ) : (
                nextAvailableDays.map((day) => (
                  <button
                    className="admin-preview-item"
                    key={day.key}
                    onClick={() => onNavigate("schedule")}
                    type="button"
                  >
                    <strong>{day.label}</strong>
                    <small>{day.availableCount} свободных местечек</small>
                  </button>
                ))
              )}
            </div>
          </article>
        </section>
      </section>
    </>
  );
}

type InboxGroup = {
  id: "new" | "waiting" | "today" | "overdue";
  title: string;
  requests: BookingRequest[];
};

function buildInboxGroups(requests: BookingRequest[], windows: TimeWindow[]): InboxGroup[] {
  const activeRequests = requests.filter((request) => request.status !== "declined");
  const groups: InboxGroup[] = [
    { id: "new", title: "Новенькие", requests: [] },
    { id: "waiting", title: "Ждём клиентку", requests: [] },
    { id: "today", title: "Сегодня красим", requests: [] },
    { id: "overdue", title: "Просрочено", requests: [] },
  ];
  const byId = new Map(groups.map((group) => [group.id, group]));

  activeRequests.forEach((request) => {
    const groupId = getInboxGroupId(request, windows);
    byId.get(groupId)?.requests.push(request);
  });

  groups.forEach((group) => {
    group.requests.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  });

  return groups;
}

function getInboxGroupId(request: BookingRequest, windows: TimeWindow[]): InboxGroup["id"] {
  if (isRequestOverdue(request, windows)) {
    return "overdue";
  }

  if (isRequestToday(request, windows)) {
    return "today";
  }

  if (request.status === "waiting_client") {
    return "waiting";
  }

  return "new";
}

function getRequestWindow(request: BookingRequest, windows: TimeWindow[]) {
  return request.preferredWindowId ? windows.find((window) => window.id === request.preferredWindowId) ?? null : null;
}

function isRequestToday(request: BookingRequest, windows: TimeWindow[]) {
  const window = getRequestWindow(request, windows);

  if (!window) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return window.startAt.slice(0, 10) === today;
}

function isRequestOverdue(request: BookingRequest, windows: TimeWindow[]) {
  if (request.status === "confirmed") {
    return false;
  }

  const window = getRequestWindow(request, windows);

  if (window) {
    return new Date(window.endAt).getTime() < Date.now();
  }

  const createdAt = new Date(request.createdAt).getTime();
  return Date.now() - createdAt > 1000 * 60 * 60 * 24;
}
