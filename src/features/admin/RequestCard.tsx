import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock3, MessageCircle, X } from "lucide-react";
import { PhotoGallery, PhotoLightbox } from "../../components/PhotoGallery";
import { contactLabels, getServiceTitle, lengthLabels, statusLabels } from "../../lib/bookingPresentation";
import { isFutureDateTime } from "../../lib/dateTime";
import { allowsLengthSelection } from "../../lib/services";
import type {
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
  ServicePreset,
  TimeWindow,
} from "../../types";

type RequestCardAction = {
  kind: "confirm" | "pick_window" | "clarify" | "review";
  label: string;
  tone: "primary" | "secondary";
};

type RequestCardState = {
  note: string | null;
  primaryAction: RequestCardAction | null;
  secondaryActions: Array<"clarify" | "decline">;
  canChangeWindow: boolean;
  canDecline: boolean;
  isLimited: boolean;
  isProblem: boolean;
  shouldOpenWindowPicker: boolean;
  timeLabel: string;
};

export function RequestCard({
  appointments,
  client,
  photos,
  request,
  services,
  windows,
  confirmRequest,
  updateStatus,
  updateWindow,
}: {
  appointments: Appointment[];
  client?: Client;
  photos: PhotoAttachment[];
  request: BookingRequest;
  services: ServicePreset[];
  windows: TimeWindow[];
  confirmRequest: (id: string) => void | Promise<unknown>;
  updateStatus: (id: string, status: RequestStatus) => void | Promise<unknown>;
  updateWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) => void | Promise<unknown>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAttachment | null>(null);
  const [proposalWindowId, setProposalWindowId] = useState(request.preferredWindowId ?? "");
  const isResolvingRef = useRef(false);

  const selectedWindow = request.preferredWindowId
    ? windows.find((window) => window.id === request.preferredWindowId) ?? null
    : null;
  const availableWindows = windows.filter((window) => window.status === "available" && isFutureDateTime(window.startAt));
  const selectedProposalWindow = useMemo(
    () =>
      availableWindows.find((window) => window.id === proposalWindowId) ??
      (selectedWindow && isFutureDateTime(selectedWindow.startAt) ? selectedWindow : null),
    [availableWindows, proposalWindowId, selectedWindow],
  );

  const service = services.find((item) => item.id === request.service) ?? null;
  const serviceTitle = getServiceTitle(services, request.service);
  const lengthLabel = allowsLengthSelection(service) ? lengthLabels[request.length] : "Своя длина";
  const photoSummary = getPhotoSummary(photos, service);
  const cardState = getRequestCardState({
    appointments,
    availableWindows,
    request,
    selectedWindow,
  });
  const canSaveWindow =
    cardState.canChangeWindow &&
    selectedProposalWindow !== null &&
    selectedProposalWindow.id !== request.preferredWindowId &&
    request.status !== "confirmed" &&
    request.status !== "declined";

  const runAction = async (action: () => void | Promise<unknown>) => {
    if (isResolvingRef.current) {
      return;
    }

    isResolvingRef.current = true;
    setIsResolving(true);
    try {
      await action();
    } finally {
      isResolvingRef.current = false;
      setIsResolving(false);
    }
  };

  const handlePrimaryAction = () => {
    if (!cardState.primaryAction) {
      setIsExpanded((value) => !value);
      return;
    }

    if (cardState.primaryAction.kind === "confirm") {
      void runAction(() => confirmRequest(request.id));
      return;
    }

    setIsExpanded(true);
  };

  return (
    <article
      className={`panel request-card admin-inbox-card${isExpanded ? " is-expanded" : ""}${
        isResolving ? " is-resolving" : ""
      }${cardState.isLimited ? " is-limited" : ""}${cardState.isProblem ? " is-problem" : ""}`}
    >
      <button className="admin-inbox-card-summary" onClick={() => setIsExpanded((value) => !value)} type="button">
        <span className={`status ${request.status}`}>{statusLabels[request.status]}</span>
        <span className="admin-inbox-card-copy">
          <strong>{client?.name ?? "Клиентка"}</strong>
          <small>{serviceTitle}</small>
          <small>{cardState.timeLabel}</small>
          <small>{cardState.note ?? photoSummary}</small>
        </span>
        <ChevronDown className="admin-inbox-card-chevron" size={18} />
      </button>

      <div className="admin-inbox-primary-action">
        {cardState.primaryAction ? (
          <button
            className={cardState.primaryAction.tone === "primary" ? "primary-button" : "secondary-button"}
            disabled={isResolving}
            onClick={handlePrimaryAction}
            type="button"
          >
            {cardState.primaryAction.kind === "confirm" ? <Check size={17} /> : <MessageCircle size={17} />}
            {cardState.primaryAction.label}
          </button>
        ) : (
          <button className="ghost-button" disabled={isResolving} onClick={() => setIsExpanded((value) => !value)} type="button">
            <MessageCircle size={17} /> Проверить
          </button>
        )}
      </div>

      {isExpanded ? (
        <div className="admin-inbox-card-details">
          {cardState.note ? <div className="admin-request-warning">{cardState.note}</div> : null}

          <div className="admin-request-meta">
            <div className="admin-request-meta-row">
              <strong>Услуга</strong>
              <span>
                {serviceTitle} · {lengthLabel}
              </span>
            </div>
            <div className="admin-request-meta-row">
              <strong>Связь</strong>
              <span>
                {client
                  ? `${contactLabels[client.preferredContactChannel]} · ${client.contactHandle || client.phone}`
                  : "Не указана"}
              </span>
            </div>
            <div className="admin-request-meta-row">
              <strong>Фото</strong>
              <span>{photoSummary}</span>
            </div>
          </div>

          <div className="client-text admin-request-brief">
            <strong>Запрос</strong>
            <p>{request.desiredResult}</p>
            {request.comment ? <p>{request.comment}</p> : null}
          </div>

          {(cardState.shouldOpenWindowPicker || cardState.canChangeWindow) && request.status !== "confirmed" && request.status !== "declined" ? (
            <label className="move-window-field admin-request-window-field">
              Окошко
              <select
                disabled={isResolving || availableWindows.length === 0}
                value={selectedProposalWindow?.id ?? ""}
                onChange={(event) => setProposalWindowId(event.target.value)}
              >
                <option value="">{availableWindows.length > 0 ? "Выбрать окошко" : "Свободных окошек нет"}</option>
                {availableWindows.map((window) => (
                  <option key={window.id} value={window.id}>
                    {window.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {photos.length > 0 ? (
            <div className="request-photo-section">
              <div className="section-inline-title">
                <strong>Фото</strong>
                <span>Открываются по тапу</span>
              </div>
              <PhotoGallery photos={photos} onOpen={setSelectedPhoto} />
            </div>
          ) : null}

          <div className="action-row admin-inbox-secondary-actions">
            {canSaveWindow ? (
              <button
                className="ghost-button"
                disabled={isResolving || !selectedProposalWindow}
                onClick={() => {
                  if (!selectedProposalWindow) {
                    return;
                  }

                  void runAction(async () => {
                    await updateWindow(request.id, selectedProposalWindow.id);
                    setProposalWindowId(selectedProposalWindow.id);
                  });
                }}
                type="button"
              >
                <Clock3 size={17} /> {request.preferredWindowId ? "Сменить окно" : "Назначить окно"}
              </button>
            ) : null}

            {cardState.secondaryActions.includes("clarify") ? (
              <button
                className="ghost-button"
                disabled={isResolving}
                onClick={() => void runAction(() => updateStatus(request.id, "needs_clarification"))}
                type="button"
              >
                <MessageCircle size={17} /> Уточнить
              </button>
            ) : null}

            {cardState.canDecline ? (
              <button
                className="danger-button"
                disabled={isResolving}
                onClick={() => void runAction(() => updateStatus(request.id, "declined"))}
                type="button"
              >
                <X size={17} /> Отклонить
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <PhotoLightbox photo={selectedPhoto} photos={photos} onSelect={setSelectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </article>
  );
}

function getRequestCardState({
  appointments,
  availableWindows,
  request,
  selectedWindow,
}: {
  appointments: Appointment[];
  availableWindows: TimeWindow[];
  request: BookingRequest;
  selectedWindow: TimeWindow | null;
}): RequestCardState {
  const hasAvailableWindow = availableWindows.length > 0;
  const hasFutureWindow = Boolean(selectedWindow && isFutureDateTime(selectedWindow.startAt));
  const linkedAppointment = appointments.find(
    (appointment) => appointment.requestId === request.id && appointment.status === "scheduled",
  );
  const isClosed = request.status === "confirmed" || request.status === "declined";
  const isLegacy = request.status === "waiting_client";
  const canConfirm =
    (request.status === "new" || request.status === "waiting_client") &&
    selectedWindow !== null &&
    hasFutureWindow &&
    selectedWindow.status === "offered";
  const canChangeWindow =
    !isClosed &&
    !isLegacy &&
    hasAvailableWindow &&
    (!selectedWindow ||
      !hasFutureWindow ||
      (selectedWindow.status === "available" && request.status === "new") ||
      selectedWindow.status === "blocked" ||
      selectedWindow.status === "reserved" ||
      request.status === "needs_clarification");
  const canDecline = request.status === "new" || request.status === "needs_clarification" || request.status === "waiting_client";

  let note: string | null = null;
  let isProblem = false;

  if (isLegacy) {
    note = "Старая запись из прошлого сценария. Сначала проверьте вручную.";
  } else if (request.status === "confirmed" && !linkedAppointment) {
    note = "Запись подтверждена, но визит не найден.";
    isProblem = true;
  } else if (request.status === "confirmed" && (!selectedWindow || selectedWindow.status !== "reserved")) {
    note = "Подтверждённая запись не совпадает с окошком.";
    isProblem = true;
  } else if (!selectedWindow && request.status !== "needs_clarification") {
    note = "Валидное окно не выбрано.";
  } else if (selectedWindow && !hasFutureWindow) {
    note = "Окошко уже прошло. Нужно выбрать новое.";
  } else if (selectedWindow && (selectedWindow.status === "reserved" || selectedWindow.status === "blocked")) {
    note = "Текущее окошко недоступно.";
  } else if (selectedWindow && selectedWindow.status === "available" && request.status === "new") {
    note = "Окно больше не выглядит предложенным. Выберите окно заново.";
  }

  const primaryAction = getPrimaryAction({
    canChangeWindow,
    canConfirm,
    isClosed,
    isLegacy,
    request,
  });

  const secondaryActions: Array<"clarify" | "decline"> = [];

  if (!isClosed && request.status === "new" && primaryAction?.kind !== "clarify") {
    secondaryActions.push("clarify");
  }

  return {
    note,
    primaryAction,
    secondaryActions,
    canChangeWindow,
    canDecline,
    isLimited: isLegacy || isProblem || isClosed,
    isProblem,
    shouldOpenWindowPicker: primaryAction?.kind === "pick_window",
    timeLabel: getRequestTimeLabel(request, selectedWindow),
  };
}

function getPrimaryAction({
  canChangeWindow,
  canConfirm,
  isClosed,
  isLegacy,
  request,
}: {
  canChangeWindow: boolean;
  canConfirm: boolean;
  isClosed: boolean;
  isLegacy: boolean;
  request: BookingRequest;
}): RequestCardAction | null {
  if (isClosed) {
    return null;
  }

  if (canConfirm) {
    return { kind: "confirm", label: "Подтвердить", tone: "primary" };
  }

  if (canChangeWindow) {
    return { kind: "pick_window", label: "Выбрать окно", tone: "primary" };
  }

  if (!isLegacy && request.status === "new") {
    return { kind: "clarify", label: "Уточнить", tone: "primary" };
  }

  if (isLegacy || request.status === "needs_clarification") {
    return { kind: "review", label: "Проверить", tone: "secondary" };
  }

  return null;
}

function getRequestTimeLabel(request: BookingRequest, selectedWindow: TimeWindow | null) {
  if (selectedWindow) {
    return selectedWindow.label;
  }

  if (request.customWindowText) {
    return request.customWindowText;
  }

  if (request.status === "needs_clarification") {
    return "Нужно уточнить время";
  }

  return "Время не выбрано";
}

function getPhotoSummary(photos: PhotoAttachment[], service: ServicePreset | null) {
  const handPhotoCount = photos.filter((photo) => photo.kind === "hands").length;
  const referencePhotoCount = photos.filter((photo) => photo.kind === "reference").length;
  const totalPhotoCount = handPhotoCount + referencePhotoCount;
  const requiredCount = Number(Boolean(service?.requiresHandPhoto)) + Number(Boolean(service?.requiresReference));
  const presentTypeCount = Number(handPhotoCount > 0) + Number(referencePhotoCount > 0);

  if (totalPhotoCount === 0) {
    return requiredCount > 0 ? "Фото нет" : "Фото не приложены";
  }

  if (requiredCount > 0 && presentTypeCount < requiredCount) {
    return "Фото не все";
  }

  return `${totalPhotoCount} фото`;
}
