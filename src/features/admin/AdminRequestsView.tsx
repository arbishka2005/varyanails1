import { useMemo } from "react";
import { compareDateTimeDesc } from "../../lib/dateTime";
import { AdminScreenHeader } from "./AdminNavigation";
import { RequestCard } from "./RequestCard";
import { type MasterWorkspaceSectionProps } from "./masterWorkspaceTypes";
import type { Appointment, BookingRequest, TimeWindow } from "../../types";

type InboxGroup = {
  id: "active" | "review";
  title: string;
  requests: BookingRequest[];
};

export function AdminRequestsView({
  appointments,
  clients,
  confirmRequest,
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
  | "photos"
  | "requests"
  | "services"
  | "updateStatus"
  | "updateWindow"
  | "windows"
>) {
  const inboxGroups = useMemo(
    () => buildVisibleInboxGroups(requests, windows, appointments),
    [appointments, requests, windows],
  );
  const inboxCount = inboxGroups.reduce((sum, group) => sum + group.requests.length, 0);

  return (
    <>
      <AdminScreenHeader eyebrow="входящие" title="Кому ответить" />

      <section className="admin-screen-stack">
        <section className="requests-stack admin-inbox-stack">
          {inboxCount === 0 ? (
            <div className="empty-state">Сейчас новых обращений нет.</div>
          ) : (
            inboxGroups.map((group) =>
              group.requests.length > 0 ? (
                <section className="admin-inbox-group" key={group.id}>
                  <div className="admin-inbox-group-header">
                    <span>{group.title}</span>
                  </div>

                  <div className="admin-inbox-list">
                    {group.requests.map((request) => (
                      <RequestCard
                        appointments={appointments}
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
      </section>
    </>
  );
}

function buildVisibleInboxGroups(
  requests: BookingRequest[],
  windows: TimeWindow[],
  appointments: Appointment[],
): InboxGroup[] {
  const activeRequests = requests
    .filter((request) => request.status === "new" || request.status === "needs_clarification")
    .sort(sortInboxRequests);

  const reviewRequests = requests
    .filter((request) => {
      if (request.status === "waiting_client") {
        return true;
      }

      return hasRequestConsistencyIssue(request, windows, appointments);
    })
    .sort(sortInboxRequests);

  return [
    { id: "active", title: "Сейчас", requests: activeRequests },
    { id: "review", title: "Проверить вручную", requests: reviewRequests },
  ];
}

function hasRequestConsistencyIssue(
  request: BookingRequest,
  windows: TimeWindow[],
  appointments: Appointment[],
) {
  if (request.status !== "confirmed") {
    return false;
  }

  const linkedAppointment = appointments.find(
    (appointment) => appointment.requestId === request.id && appointment.status === "scheduled",
  );

  if (!linkedAppointment || !request.preferredWindowId) {
    return true;
  }

  const selectedWindow = windows.find((window) => window.id === request.preferredWindowId) ?? null;
  return !selectedWindow || selectedWindow.status !== "reserved";
}

function sortInboxRequests(left: BookingRequest, right: BookingRequest) {
  return getRequestSortRank(left) - getRequestSortRank(right) || compareDateTimeDesc(left.createdAt, right.createdAt);
}

function getRequestSortRank(request: BookingRequest) {
  if (request.status === "new") {
    return 0;
  }

  if (request.status === "needs_clarification") {
    return 1;
  }

  if (request.status === "waiting_client") {
    return 2;
  }

  return 3;
}
