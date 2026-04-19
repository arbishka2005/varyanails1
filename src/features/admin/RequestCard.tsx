import { useState } from "react";
import { Check, ChevronDown, Clock3, MessageCircle, Phone, Send, Sparkles, X } from "lucide-react";
import { useRef } from "react";
import { Info } from "../../components/Info";
import { PhotoGallery, PhotoLightbox } from "../../components/PhotoGallery";
import { contactLabels, getServiceTitle, lengthLabels, statusLabels } from "../../lib/bookingPresentation";
import { isFutureDateTime } from "../../lib/dateTime";
import { allowsLengthSelection } from "../../lib/services";
import type { BookingRequest, Client, PhotoAttachment, RequestStatus, ServicePreset, TimeWindow } from "../../types";

export function RequestCard({
  client,
  photos,
  request,
  services,
  windows,
  confirmRequest,
  updateStatus,
  updateWindow,
}: {
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
  const [reviewStep, setReviewStep] = useState<number | null>(null);
  const [proposalWindowId, setProposalWindowId] = useState(request.preferredWindowId ?? "");
  const isResolvingRef = useRef(false);
  const selectedWindow = request.preferredWindowId
    ? windows.find((window) => window.id === request.preferredWindowId) ?? null
    : null;
  const availableWindows = windows.filter(
    (window) =>
      (window.status === "available" && isFutureDateTime(window.startAt)) ||
      window.id === request.preferredWindowId,
  );
  const firstAvailableWindow =
    availableWindows.find((window) => window.status === "available" && isFutureDateTime(window.startAt)) ?? null;
  const hasConcreteWindow = Boolean(selectedWindow && isFutureDateTime(selectedWindow.startAt));
  const handPhoto = photos.find((photo) => photo.kind === "hands");
  const referencePhoto = photos.find((photo) => photo.kind === "reference");
  const service = services.find((item) => item.id === request.service) ?? null;
  const serviceTitle = getServiceTitle(services, request.service);
  const lengthLabel = allowsLengthSelection(service) ? lengthLabels[request.length] : "Своя длина";
  const windowLabel = selectedWindow?.label ?? request.customWindowText ?? "Время не выбрано";
  const mainAction = getNextAction({
    hasConcreteWindow,
    hasAvailableWindow: Boolean(firstAvailableWindow),
    request,
  });

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

  const offerFirstWindow = async () => {
    if (firstAvailableWindow) {
      await updateWindow(request.id, firstAvailableWindow.id);
      return;
    }

    await updateStatus(request.id, "needs_clarification");
  };

  const handleMainAction = () => {
    if (mainAction.kind === "done" || mainAction.kind === "closed") {
      return;
    }

    if (mainAction.kind === "review") {
      setIsExpanded(true);
      setReviewStep(0);
      return;
    }

    if (mainAction.kind === "accept") {
      void runAction(() => confirmRequest(request.id));
      return;
    }

    if (mainAction.kind === "offer") {
      void runAction(offerFirstWindow);
      return;
    }

    if (mainAction.kind === "clarify") {
      void runAction(() => updateStatus(request.id, "needs_clarification"));
      return;
    }

    void runAction(() => updateStatus(request.id, "declined"));
  };

  return (
    <article className={`panel request-card admin-inbox-card${isExpanded ? " is-expanded" : ""}${isResolving ? " is-resolving" : ""}`}>
      <button className="admin-inbox-card-summary" onClick={() => setIsExpanded((value) => !value)} type="button">
        <span className={`status ${request.status}`}>{statusLabels[request.status]}</span>
        <span className="admin-inbox-card-copy">
          <strong>{client?.name ?? "Клиентка"}</strong>
          <small>
            {serviceTitle} · {windowLabel}
          </small>
        </span>
        <span className="request-id">{request.id}</span>
        <ChevronDown className="admin-inbox-card-chevron" size={18} />
      </button>

      <div className="admin-inbox-primary-action">
        <button
          className={mainAction.kind === "decline" || mainAction.kind === "closed" ? "danger-button" : "primary-button"}
          disabled={isResolving || mainAction.kind === "done" || mainAction.kind === "closed"}
          onClick={handleMainAction}
          type="button"
        >
          {mainAction.kind === "review" ? <Sparkles size={17} /> : mainAction.kind === "accept" ? <Check size={17} /> : mainAction.kind === "offer" ? <Clock3 size={17} /> : mainAction.kind === "clarify" ? <MessageCircle size={17} /> : mainAction.kind === "done" ? <Check size={17} /> : <X size={17} />}
          {mainAction.label}
        </button>
      </div>

      {isExpanded ? (
        <div className="admin-inbox-card-details">
          {reviewStep !== null ? (
            <AdminRequestReviewFlow
              availableWindows={availableWindows.filter(
                (window) => window.status === "available" && isFutureDateTime(window.startAt),
              )}
              client={client}
              photos={photos}
              proposalWindowId={proposalWindowId || firstAvailableWindow?.id || ""}
              request={request}
              lengthLabel={lengthLabel}
              serviceTitle={serviceTitle}
              step={reviewStep}
              onCancel={() => setReviewStep(null)}
              onComplete={(windowId) => {
                void runAction(async () => {
                  if (!windowId) {
                    await updateStatus(request.id, "needs_clarification");
                    return;
                  }

                  await updateWindow(request.id, windowId);
                  setReviewStep(null);
                });
              }}
              onPhotoOpen={setSelectedPhoto}
              onStepChange={setReviewStep}
              onWindowChange={setProposalWindowId}
            />
          ) : (
            <>
              <div className="info-grid">
                <Info icon={<Phone size={16} />} label="Телефон" value={client?.phone ?? "Не указан"} />
                <Info
                  icon={<MessageCircle size={16} />}
                  label="Связь"
                  value={client ? `${contactLabels[client.preferredContactChannel]} ${client.contactHandle}` : "Не указана"}
                />
                <Info label="Клиентка" value={client?.firstVisit ? "Первый визит" : "Постоянная"} />
                <Info label="Услуга" value={serviceTitle} />
                <Info label="Длина" value={lengthLabel} />
                <Info icon={<Clock3 size={16} />} label="Время" value={windowLabel} />
                <Info label="Фото рук" value={handPhoto?.fileName ?? "Не приложено"} />
                <Info label="Референс" value={referencePhoto?.fileName ?? "Не приложено"} />
                <Info label="Стоимость" value={`от ${(request.estimatedPriceFrom ?? 0).toLocaleString("ru-RU")} ₽`} />
              </div>

              <div className="client-text">
                <strong>Что хочет клиентка</strong>
                <p>{request.desiredResult}</p>
                {request.comment ? <p>{request.comment}</p> : null}
                <span>Расчёт: {request.estimatedMinutes} мин</span>
              </div>

              {photos.length > 0 ? (
                <div className="request-photo-section">
                  <div className="section-inline-title">
                    <strong>Фото клиентки</strong>
                    <span>Тап по фото откроет крупно.</span>
                  </div>
                  <PhotoGallery photos={photos} onOpen={setSelectedPhoto} />
                </div>
              ) : null}

              <label className="move-window-field">
                Окошко заявки
                <select
                  disabled={isResolving || request.status === "confirmed" || request.status === "declined"}
                  value={request.preferredWindowId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    void runAction(() => updateWindow(request.id, value || null));
                  }}
                >
                  <option value="">Выбрать окошко</option>
                  {availableWindows.map((window) => (
                    <option key={window.id} value={window.id}>
                      {window.label}
                    </option>
                  ))}
                </select>
              </label>

              {request.status === "confirmed" ? (
                <div className="empty-state">Заявка уже записана. Перенос и отмена теперь в расписании.</div>
              ) : request.status === "declined" ? (
                <div className="empty-state">Заявка закрыта.</div>
              ) : (
                <div className="action-row admin-inbox-secondary-actions">
                  <button
                    onClick={() => void runAction(() => confirmRequest(request.id))}
                    className="success-button"
                    disabled={isResolving || !hasConcreteWindow}
                    type="button"
                  >
                    <Check size={17} /> Записать
                  </button>
                  {!hasConcreteWindow ? (
                    <button disabled={isResolving} onClick={() => void runAction(offerFirstWindow)} className="secondary-button" type="button">
                      <Clock3 size={17} /> Выбрать окошко
                    </button>
                  ) : null}
                  <button disabled={isResolving} onClick={() => void runAction(() => updateStatus(request.id, "needs_clarification"))} className="secondary-button" type="button">
                    <MessageCircle size={17} /> Уточнить
                  </button>
                  <button disabled={isResolving} onClick={() => void runAction(() => updateStatus(request.id, "declined"))} className="danger-button" type="button">
                    <X size={17} /> Не брать
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      <PhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </article>
  );
}

type NextAction = {
  kind: "review" | "accept" | "offer" | "clarify" | "decline" | "done" | "closed";
  label: string;
};

function getNextAction({
  hasAvailableWindow,
  hasConcreteWindow,
  request,
}: {
  hasAvailableWindow: boolean;
  hasConcreteWindow: boolean;
  request: BookingRequest;
}): NextAction {
  if (request.status === "confirmed") {
    return { kind: "done", label: "Уже записана" };
  }

  if (request.status === "declined") {
    return { kind: "closed", label: "Заявка закрыта" };
  }

  if (request.status === "new" || request.status === "needs_clarification") {
    if (hasConcreteWindow) {
      return { kind: "accept", label: "Записать" };
    }

    return hasAvailableWindow
      ? { kind: "review", label: "Разобрать заявку" }
      : { kind: "clarify", label: "Уточнить" };
  }

  if (hasConcreteWindow) {
    return { kind: "accept", label: request.status === "waiting_client" ? "Записать сейчас" : "Записать" };
  }

  if (hasAvailableWindow) {
    return { kind: "offer", label: "Предложить окошко" };
  }

  if (request.status === "waiting_client") {
    return { kind: "clarify", label: "Уточнить" };
  }

  return { kind: "clarify", label: "Уточнить" };
}

function AdminRequestReviewFlow({
  availableWindows,
  client,
  photos,
  proposalWindowId,
  request,
  lengthLabel,
  serviceTitle,
  step,
  onCancel,
  onComplete,
  onPhotoOpen,
  onStepChange,
  onWindowChange,
}: {
  availableWindows: TimeWindow[];
  client?: Client;
  photos: PhotoAttachment[];
  proposalWindowId: string;
  request: BookingRequest;
  lengthLabel: string;
  serviceTitle: string;
  step: number;
  onCancel: () => void;
  onComplete: (windowId: string) => void;
  onPhotoOpen: (photo: PhotoAttachment) => void;
  onStepChange: (step: number) => void;
  onWindowChange: (windowId: string) => void;
}) {
  const selectedProposalWindow =
    availableWindows.find((window) => window.id === proposalWindowId && isFutureDateTime(window.startAt)) ?? null;
  const canSendProposal = Boolean(selectedProposalWindow);
  const steps = ["Хочет", "Фото", "Окошко", "Ответ"];

  return (
    <div className="admin-review-flow">
      <div className="admin-review-progress" aria-label="Разбор заявки">
        {steps.map((label, index) => (
          <button
            className={`${index < step ? "is-complete " : ""}${index === step ? "is-active" : ""}`}
            key={label}
            onClick={() => onStepChange(index)}
            type="button"
          >
            <span>{index + 1}</span>
            <small>{label}</small>
          </button>
        ))}
      </div>

      <div className="admin-review-screen">
        {step === 0 ? (
          <>
            <span className="status new">Что хочет клиентка</span>
            <h3>{client?.name ?? "Клиентка"}</h3>
            <div className="client-text">
              <strong>{serviceTitle}</strong>
              <p>{request.desiredResult}</p>
              {request.comment ? <p>{request.comment}</p> : null}
              <span>
                {lengthLabel} · {request.estimatedMinutes} мин · от{" "}
                {(request.estimatedPriceFrom ?? 0).toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <span className="status">Фото</span>
            <h3>Глянуть визуал</h3>
            {photos.length > 0 ? (
              <PhotoGallery photos={photos} onOpen={onPhotoOpen} />
            ) : (
              <div className="empty-state">Фото не приложены.</div>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <span className="status new">Выбрать окошко</span>
            <h3>Куда ставим?</h3>
            <div className="admin-review-window-list">
              {availableWindows.length === 0 ? (
                <div className="empty-state">Окошек нет. Лучше спросить ещё.</div>
              ) : (
                availableWindows.map((window) => (
                  <button
                    className={proposalWindowId === window.id ? "active" : ""}
                    key={window.id}
                    onClick={() => onWindowChange(window.id)}
                    type="button"
                  >
                    {window.label}
                  </button>
                ))
              )}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <span className="status confirmed">Решение</span>
            <h3>{canSendProposal ? "Поставить окошко" : "Уточнить"}</h3>
            <div className="admin-review-summary">
              <strong>{client?.name ?? "Клиентка"}</strong>
              <span>{serviceTitle}</span>
              <span>{selectedProposalWindow?.label ?? "Нужно уточнить время"}</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="admin-review-actions">
        <button className="secondary-button" onClick={step === 0 ? onCancel : () => onStepChange(step - 1)} type="button">
          {step === 0 ? "Закрыть" : "Назад"}
        </button>
        <button
          className="primary-button"
          onClick={step === 3 ? () => onComplete(proposalWindowId) : () => onStepChange(step + 1)}
          type="button"
        >
          {step === 3 ? (
            <>
              {canSendProposal ? "Выбрать" : "Уточнить"} <Send size={17} />
            </>
          ) : (
            <>
              Далее <Sparkles size={17} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
