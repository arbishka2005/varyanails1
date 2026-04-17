import { useState } from "react";
import { Check, ChevronDown, Clock3, MessageCircle, Phone, Send, Sparkles, X } from "lucide-react";
import { Info } from "../../components/Info";
import { PhotoGallery, PhotoLightbox } from "../../components/PhotoGallery";
import { contactLabels, getServiceTitle, lengthLabels, statusLabels } from "../../lib/bookingPresentation";
import { customWindowValue } from "../booking/formState";
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
  confirmRequest: (id: string) => void;
  updateStatus: (id: string, status: RequestStatus) => void;
  updateWindow: (id: string, preferredWindowId: string | null, customWindowText?: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAttachment | null>(null);
  const [reviewStep, setReviewStep] = useState<number | null>(null);
  const [proposalWindowId, setProposalWindowId] = useState(request.preferredWindowId ?? "");
  const selectedWindow = request.preferredWindowId
    ? windows.find((window) => window.id === request.preferredWindowId) ?? null
    : null;
  const availableWindows = windows.filter(
    (window) =>
      window.status === "available" || window.status === "offered" || window.id === request.preferredWindowId,
  );
  const firstAvailableWindow = availableWindows.find((window) => window.status === "available") ?? availableWindows[0];
  const hasConcreteWindow = Boolean(selectedWindow);
  const handPhoto = photos.find((photo) => photo.kind === "hands");
  const referencePhoto = photos.find((photo) => photo.kind === "reference");
  const serviceTitle = getServiceTitle(services, request.service);
  const windowLabel = selectedWindow?.label ?? request.customWindowText ?? "Время не выбрано";
  const mainAction = getNextAction({
    hasConcreteWindow,
    hasAvailableWindow: Boolean(firstAvailableWindow),
    request,
  });

  const runAction = (action: () => void) => {
    setIsResolving(true);
    action();
    window.setTimeout(() => setIsResolving(false), 900);
  };

  const offerFirstWindow = () => {
    if (firstAvailableWindow) {
      updateWindow(request.id, firstAvailableWindow.id);
      return;
    }

    updateStatus(request.id, "needs_clarification");
  };

  const handleMainAction = () => {
    if (mainAction.kind === "review") {
      setIsExpanded(true);
      setReviewStep(0);
      return;
    }

    if (mainAction.kind === "accept") {
      runAction(() => confirmRequest(request.id));
      return;
    }

    if (mainAction.kind === "offer") {
      runAction(offerFirstWindow);
      return;
    }

    if (mainAction.kind === "clarify") {
      runAction(() => updateStatus(request.id, "needs_clarification"));
      return;
    }

    runAction(() => updateStatus(request.id, "declined"));
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
        <button className={mainAction.kind === "decline" ? "danger-button" : "primary-button"} onClick={handleMainAction} type="button">
          {mainAction.kind === "review" ? <Sparkles size={17} /> : mainAction.kind === "accept" ? <Check size={17} /> : mainAction.kind === "offer" ? <Clock3 size={17} /> : mainAction.kind === "clarify" ? <MessageCircle size={17} /> : <X size={17} />}
          {mainAction.label}
        </button>
      </div>

      {isExpanded ? (
        <div className="admin-inbox-card-details">
          {reviewStep !== null ? (
            <AdminRequestReviewFlow
              availableWindows={availableWindows}
              client={client}
              photos={photos}
              proposalWindowId={proposalWindowId || firstAvailableWindow?.id || customWindowValue}
              request={request}
              selectedWindow={selectedWindow}
              serviceTitle={serviceTitle}
              step={reviewStep}
              onCancel={() => setReviewStep(null)}
              onComplete={(windowId) => {
                runAction(() => {
                  if (windowId === customWindowValue) {
                    updateStatus(request.id, "needs_clarification");
                    return;
                  }

                  updateWindow(request.id, windowId);
                });
                setReviewStep(null);
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
                <Info label="Длина" value={lengthLabels[request.length]} />
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
                Предложить окошко
                <select
                  value={request.preferredWindowId ?? customWindowValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    runAction(() => updateWindow(request.id, value === customWindowValue ? null : value));
                  }}
                >
                  {availableWindows.map((window) => (
                    <option key={window.id} value={window.id}>
                      {window.label}
                    </option>
                  ))}
                  <option value={customWindowValue}>Нужно спросить другое время</option>
                </select>
              </label>

              <div className="action-row admin-inbox-secondary-actions">
                <button
                  onClick={() => runAction(() => confirmRequest(request.id))}
                  className="success-button"
                  disabled={!hasConcreteWindow || request.status === "confirmed"}
                  type="button"
                >
                  <Check size={17} /> Записать
                </button>
                <button onClick={() => runAction(offerFirstWindow)} className="secondary-button" type="button">
                  <Clock3 size={17} /> Предложить окошко
                </button>
                <button onClick={() => runAction(() => updateStatus(request.id, "needs_clarification"))} className="secondary-button" type="button">
                  <MessageCircle size={17} /> Спросить ещё
                </button>
                <button onClick={() => runAction(() => updateStatus(request.id, "declined"))} className="danger-button" type="button">
                  <X size={17} /> Не брать
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <PhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </article>
  );
}

type NextAction = {
  kind: "review" | "accept" | "offer" | "clarify" | "decline";
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
  if (request.status === "new" || request.status === "needs_clarification") {
    return { kind: "review", label: "Разобрать заявку" };
  }

  if (request.status === "confirmed") {
    return { kind: "clarify", label: "Спросить ещё" };
  }

  if (hasConcreteWindow) {
    return { kind: "accept", label: "Записать" };
  }

  if (hasAvailableWindow) {
    return { kind: "offer", label: "Предложить окошко" };
  }

  if (request.status === "waiting_client") {
    return { kind: "clarify", label: "Спросить ещё" };
  }

  return { kind: "clarify", label: "Спросить ещё" };
}

function AdminRequestReviewFlow({
  availableWindows,
  client,
  photos,
  proposalWindowId,
  request,
  selectedWindow,
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
  selectedWindow: TimeWindow | null;
  serviceTitle: string;
  step: number;
  onCancel: () => void;
  onComplete: (windowId: string) => void;
  onPhotoOpen: (photo: PhotoAttachment) => void;
  onStepChange: (step: number) => void;
  onWindowChange: (windowId: string) => void;
}) {
  const selectedProposalWindow = availableWindows.find((window) => window.id === proposalWindowId) ?? selectedWindow;
  const canSendProposal = proposalWindowId !== customWindowValue && Boolean(selectedProposalWindow);
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
                {lengthLabels[request.length]} · {request.estimatedMinutes} мин · от{" "}
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
            <span className="status waiting_client">Выбрать окошко</span>
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
              <button
                className={proposalWindowId === customWindowValue ? "active" : ""}
                onClick={() => onWindowChange(customWindowValue)}
                type="button"
              >
                Спросить ещё
              </button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <span className="status confirmed">Отправка</span>
            <h3>{canSendProposal ? "Отправить окошко" : "Спросить ещё"}</h3>
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
              {canSendProposal ? "Отправить" : "Спросить"} <Send size={17} />
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
