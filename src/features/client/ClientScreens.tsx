import type { ReactNode } from "react";
import {
  CalendarDays,
  Check,
  History,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import heroMainImage from "../../assets/hero-main.jpg";
import { Info } from "../../components/Info";
import { contactLabels, statusLabels } from "../../lib/bookingPresentation";
import { PHONE_PREFIX } from "../../lib/phone";
import type { ClientSection, TelegramUser } from "../../app/navigation";
import type { FormState } from "../booking/formState";
import type { PublicBookingRequest } from "../../types";

export function ClientHeader() {
  return (
    <section className="topbar client-hero">
      <div className="hero-copy">
        <p className="eyebrow">vvrnailss</p>
        <h1>Запись на ногти</h1>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <img alt="" src={heroMainImage} />
      </div>
    </section>
  );
}

export function ClientScreenHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="panel client-screen-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <button className="secondary-button" onClick={onAction} type="button">
          <Sparkles size={17} /> {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export function ClientHomeScreen({
  hasRequest,
  lastRequestInfo,
  lastSubmittedRequestId,
  confirmClientWindow,
  openRequests,
  openBookingFlow,
}: {
  hasRequest: boolean;
  lastRequestInfo: PublicBookingRequest | null;
  lastSubmittedRequestId: string | null;
  confirmClientWindow: (requestToken: string) => void;
  openRequests: () => void;
  openBookingFlow: () => void;
}) {
  const request = lastRequestInfo?.request ?? null;
  const canConfirmWindow = Boolean(
    request?.status === "waiting_client" && lastRequestInfo?.window && request.publicToken,
  );
  const isConfirmed = request?.status === "confirmed";
  const statusLabel = request ? statusLabels[request.status] : hasRequest ? "Ждём ответ мастера" : "Новая запись";
  const windowLabel =
    lastRequestInfo?.window?.label ?? request?.customWindowText ?? (isConfirmed ? "Время уточняется" : "");
  const mainActionLabel = !hasRequest
    ? "Начать запись"
    : canConfirmWindow
      ? "Подтвердить время"
      : isConfirmed
        ? "Открыть запись"
        : "Смотреть статус";

  const mainAction = () => {
    if (!hasRequest) {
      openBookingFlow();
      return;
    }

    if (canConfirmWindow && request?.publicToken) {
      confirmClientWindow(request.publicToken);
      return;
    }

    openRequests();
  };

  return (
    <section className="client-home-grid client-home-grid-single">
      <article
        className={`panel client-home-entry${canConfirmWindow ? " needs-confirmation" : ""}${isConfirmed ? " is-boarding-pass" : ""}`}
      >
        <div className="client-home-entry-glow" aria-hidden="true" />

        <div className="client-home-entry-main">
          <span className={`status ${request?.status ?? "new"}`}>{statusLabel}</span>

          {!hasRequest ? (
            <>
              <p className="eyebrow">vvrnailss</p>
              <h1>Привет, хочешь записаться?</h1>
            </>
          ) : canConfirmWindow ? (
            <>
              <p className="eyebrow">мастер предложил время</p>
              <h1>Подтвердить время</h1>
              <p>{windowLabel}</p>
            </>
          ) : isConfirmed ? (
            <>
              <p className="eyebrow">ближайший визит</p>
              <h1>{windowLabel}</h1>
              <p>{request?.desiredResult || "Запись подтверждена"}</p>
            </>
          ) : (
            <>
              <p className="eyebrow">текущая заявка</p>
              <h1>{statusLabel}</h1>
              <p>{windowLabel || `Заявка ${lastSubmittedRequestId ?? request?.id ?? ""}`.trim()}</p>
            </>
          )}
        </div>

        {isConfirmed ? (
          <div className="client-boarding-pass-meta" aria-label="Детали визита">
            <div>
              <span>Статус</span>
              <strong>Подтверждена</strong>
            </div>
            <div>
              <span>Заявка</span>
              <strong>{request?.id ?? lastSubmittedRequestId ?? "-"}</strong>
            </div>
          </div>
        ) : null}

        <button className="primary-button client-home-entry-action" onClick={mainAction} type="button">
          {canConfirmWindow ? <Check size={18} /> : isConfirmed ? <CalendarDays size={18} /> : <Send size={18} />}
          {mainActionLabel}
        </button>
      </article>
    </section>
  );
}

export function ClientRequestsScreen({
  lastRequestInfo,
  lastSubmittedRequestId,
  confirmClientWindow,
  refreshLastRequest,
  openBookingFlow,
}: {
  lastRequestInfo: PublicBookingRequest | null;
  lastSubmittedRequestId: string | null;
  confirmClientWindow: (requestToken: string) => void;
  refreshLastRequest: (requestToken: string) => Promise<PublicBookingRequest | null>;
  openBookingFlow: () => void;
}) {
  return (
    <>
      <ClientScreenHeader
        eyebrow="мои записи"
        title="Статус заявки"
        actionLabel="Новая запись"
        onAction={openBookingFlow}
      />

      <ClientStatusPanel
        lastRequestInfo={lastRequestInfo}
        lastSubmittedRequestId={lastSubmittedRequestId}
        confirmClientWindow={confirmClientWindow}
        refreshLastRequest={refreshLastRequest}
        onBookAgain={openBookingFlow}
      />
    </>
  );
}

export function ClientProfileScreen({
  form,
  telegramUser,
  openBookingFlow,
  openRequests,
}: {
  form: FormState;
  telegramUser: TelegramUser | undefined;
  openBookingFlow: () => void;
  openRequests: () => void;
}) {
  const profileName =
    form.clientName.trim() ||
    [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(" ").trim() ||
    "Гость";
  const profileHandle = form.contactHandle.trim() || (telegramUser?.username ? `@${telegramUser.username}` : "");

  return (
    <>
      <ClientScreenHeader
        eyebrow="профиль"
        title="Ваши данные"
        actionLabel="К заявке"
        onAction={openRequests}
      />

      <section className="client-profile-grid">
        <div className="panel client-profile-card">
          <h3>{profileName}</h3>
          <div className="info-grid">
            <Info icon={<Phone size={16} />} label="Телефон" value={form.phone || PHONE_PREFIX} />
            <Info
              icon={<MessageCircle size={16} />}
              label="Связь"
              value={`${contactLabels[form.contactChannel]} ${profileHandle || "не указан"}`}
            />
            <Info label="Telegram" value={telegramUser?.username ? `@${telegramUser.username}` : "не подключён"} />
            <Info label="Статус" value={form.isNewClient ? "Первый визит" : "Повторная запись"} />
          </div>
        </div>

        <div className="panel client-focus-panel">
          <h3>Новая запись</h3>
          <button className="primary-button" onClick={openBookingFlow} type="button">
            <Send size={17} /> Открыть запись
          </button>
        </div>
      </section>
    </>
  );
}

export function ClientStatusPanel({
  lastRequestInfo,
  lastSubmittedRequestId,
  confirmClientWindow,
  refreshLastRequest,
  onBookAgain,
  compact = false,
}: {
  lastRequestInfo: PublicBookingRequest | null;
  lastSubmittedRequestId: string | null;
  confirmClientWindow: (requestToken: string) => void;
  refreshLastRequest: (requestToken: string) => Promise<PublicBookingRequest | null>;
  onBookAgain: () => void;
  compact?: boolean;
}) {
  const timelineIndex = getClientTimelineIndex(lastRequestInfo);
  const request = lastRequestInfo?.request ?? null;
  const windowLabel = lastRequestInfo?.window?.label ?? request?.customWindowText ?? "";
  const canConfirmWindow = Boolean(
    request?.status === "waiting_client" && lastRequestInfo?.window && request.publicToken,
  );

  if (!lastRequestInfo && !lastSubmittedRequestId) {
    return (
      <div className="panel client-empty-state-panel">
        <h3>Записей пока нет</h3>
        <button className="primary-button" onClick={onBookAgain} type="button">
          <Send size={17} /> Перейти к записи
        </button>
      </div>
    );
  }

  if (!lastRequestInfo) {
    return (
      <div className={`panel notice-panel booking-celebration client-status-panel${compact ? " compact" : ""}`}>
        <div className="client-status-heading">
          <span className="status new">Заявка отправлена</span>
          <h3>Заявка {lastSubmittedRequestId}</h3>
        </div>
        <ClientRequestTimeline activeIndex={timelineIndex} />
        {!compact ? (
          <div className="action-row">
            <button className="secondary-button" disabled type="button">
              <History size={17} /> Ждём ответ
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`panel notice-panel booking-celebration client-status-panel${compact ? " compact" : ""}`}>
      <div className="client-status-heading">
        <span className={`status ${lastRequestInfo.request.status}`}>{statusLabels[lastRequestInfo.request.status]}</span>
        <h3>Заявка {lastRequestInfo.request.id}</h3>
        {windowLabel ? <p>{windowLabel}</p> : null}
      </div>

      <ClientRequestTimeline activeIndex={timelineIndex} />

      {!compact ? (
        <div className="action-row">
          {canConfirmWindow && request?.publicToken ? (
            <button
              className="primary-button"
              onClick={() => confirmClientWindow(request.publicToken!)}
              type="button"
            >
              <Check size={17} /> Подтвердить время
            </button>
          ) : null}
          <button
            className="secondary-button"
            onClick={() => {
              if (lastRequestInfo.request.publicToken) {
                void refreshLastRequest(lastRequestInfo.request.publicToken);
              }
            }}
            type="button"
          >
            <History size={17} /> Обновить статус
          </button>
        </div>
      ) : null}
    </div>
  );
}

const clientTimelineSteps = [
  "Заявка отправлена",
  "Мастер смотрит",
  "Предложено время",
  "Подтверждено",
  "Визит завершён",
] as const;

function getClientTimelineIndex(lastRequestInfo: PublicBookingRequest | null) {
  if (!lastRequestInfo) {
    return 1;
  }

  if (lastRequestInfo.request.status === "waiting_client") {
    return 2;
  }

  if (lastRequestInfo.request.status === "confirmed") {
    return 3;
  }

  return 1;
}

function ClientRequestTimeline({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="client-request-timeline" aria-label="Этапы записи">
      {clientTimelineSteps.map((label, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;

        return (
          <li className={`${isComplete ? "is-complete " : ""}${isActive ? "is-active" : ""}`} key={label}>
            <span className="client-request-timeline-marker">{isComplete ? <Check size={13} /> : index + 1}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ClientBottomNav({
  currentSection,
  hasRequest,
  onNavigate,
}: {
  currentSection: ClientSection;
  hasRequest: boolean;
  onNavigate: (section: ClientSection) => void;
}) {
  const items: { section: ClientSection; label: string; icon: ReactNode }[] = [
    { section: "home", label: "Главная", icon: <Sparkles size={18} /> },
    { section: "booking", label: "Запись", icon: <Send size={18} /> },
    { section: "requests", label: "Мои записи", icon: <History size={18} /> },
    { section: "profile", label: "Профиль", icon: <UserRound size={18} /> },
  ];

  return (
    <nav className="client-bottom-nav" aria-label="Навигация клиента">
      {items.map((item) => (
        <button
          aria-current={currentSection === item.section ? "page" : undefined}
          key={item.section}
          className={currentSection === item.section ? "active" : ""}
          onClick={() => onNavigate(item.section)}
          type="button"
        >
          <span className="client-bottom-nav-icon">
            {item.icon}
            {item.section === "requests" && hasRequest ? <span className="client-bottom-nav-badge" /> : null}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
