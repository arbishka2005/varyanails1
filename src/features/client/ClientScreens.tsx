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
import { isFutureDateTime } from "../../lib/dateTime";
import { formatDayLabel } from "../../lib/displayTime";
import type { ClientSection, TelegramUser } from "../../app/navigation";
import { getClientHomeStatus, isActiveClientBooking, isFinishedClientVisit } from "./clientBookingState";
import type { FormState } from "../booking/formState";
import type { PublicBookingRequest, TimeWindow } from "../../types";

type LastRequestLookupStatus = "idle" | "loading" | "stale";

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
        <button className="ghost-button" onClick={onAction} type="button">
          <Sparkles size={17} /> {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export function ClientHomeScreen({
  lastRequestInfo,
  lastSubmittedRequestId,
  lastRequestLookupStatus,
  confirmClientWindow,
  openRequests,
  openBookingFlow,
}: {
  lastRequestInfo: PublicBookingRequest | null;
  lastSubmittedRequestId: string | null;
  lastRequestLookupStatus: LastRequestLookupStatus;
  confirmClientWindow: (requestToken: string) => void;
  openRequests: () => void;
  openBookingFlow: () => void;
}) {
  const homeStatus = getClientHomeStatus({
    hasStoredAccess: Boolean(lastSubmittedRequestId),
    lastRequestInfo,
    lookupStatus: lastRequestLookupStatus,
  });
  const activeRequestInfo = homeStatus.activeRequestInfo;
  const request = activeRequestInfo?.request ?? null;
  const hasActiveHomeBooking = homeStatus.hasActiveBooking;
  const isCheckingStoredRequest = homeStatus.kind === "loading";
  const isStaleStoredRequest = homeStatus.kind === "stale";
  const canConfirmWindow = canConfirmClientWindow(request?.status, activeRequestInfo?.window, request?.publicToken);
  const isConfirmed = homeStatus.kind === "upcoming";
  const statusLabel = request
    ? statusLabels[request.status]
    : isCheckingStoredRequest
      ? "Проверяю запись"
      : "Запись";
  const windowLabel =
    activeRequestInfo?.window?.label ?? request?.customWindowText ?? (isConfirmed ? "Время уточняется" : "");
  const mainActionLabel = !hasActiveHomeBooking
    ? "Начать запись"
    : canConfirmWindow
      ? "Подтвердить время"
      : isConfirmed
        ? "Открыть запись"
        : "Смотреть статус";

  const mainAction = () => {
    if (!hasActiveHomeBooking) {
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

          {isCheckingStoredRequest ? (
            <>
              <p className="eyebrow">минутку</p>
              <h1>Проверяю запись</h1>
            </>
          ) : !hasActiveHomeBooking ? (
            <>
              <p className="eyebrow">vvrnailss</p>
              <h1>Привет, хочешь записаться?</h1>
              {isStaleStoredRequest ? <p>Старая ссылка на запись уже не актуальна.</p> : null}
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
              <p>{request?.desiredResult || "Вы записаны"}</p>
            </>
          ) : (
            <>
              <p className="eyebrow">текущая запись</p>
              <h1>{statusLabel}</h1>
              <p>{windowLabel || (lastSubmittedRequestId || request?.id ? "Вы отправили заявку" : "")}</p>
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
              <span>Запись</span>
              <strong>Подтверждена</strong>
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
  lastRequestLookupStatus,
  confirmClientWindow,
  openBookingFlow,
  refreshLastRequest,
}: {
  lastRequestInfo: PublicBookingRequest | null;
  lastSubmittedRequestId: string | null;
  lastRequestLookupStatus: LastRequestLookupStatus;
  confirmClientWindow: (requestToken: string) => void;
  openBookingFlow: () => void;
  refreshLastRequest: (requestToken: string) => Promise<PublicBookingRequest | null>;
}) {
  return (
    <>
      <ClientScreenHeader
        eyebrow="мои записи"
        title="Моя запись"
      />

      <ClientStatusPanel
        lastRequestInfo={lastRequestInfo}
        lastSubmittedRequestId={lastSubmittedRequestId}
        lastRequestLookupStatus={lastRequestLookupStatus}
        confirmClientWindow={confirmClientWindow}
        openBookingFlow={openBookingFlow}
        refreshLastRequest={refreshLastRequest}
      />
    </>
  );
}

export function ClientProfileScreen({
  form,
  telegramUser,
  openBookingFlow,
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
        eyebrow="данные"
        title="Контакты для записи"
      />

      <section className="client-profile-grid">
        <div className="panel client-profile-card">
          <h3>{profileName}</h3>
          <div className="info-grid">
            <Info icon={<Phone size={16} />} label="Телефон" value={form.phone || "Добавите при записи"} />
            <Info
              icon={<MessageCircle size={16} />}
              label="Связь"
              value={profileHandle ? `${contactLabels[form.contactChannel]} ${profileHandle}` : "Добавите при записи"}
            />
            <Info label="Telegram" value={telegramUser?.username ? `@${telegramUser.username}` : "не подключён"} />
          </div>
        </div>

        <div className="panel client-focus-panel">
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
  lastRequestLookupStatus,
  confirmClientWindow,
  openBookingFlow,
  refreshLastRequest,
  compact = false,
}: {
  lastRequestInfo: PublicBookingRequest | null;
  lastSubmittedRequestId: string | null;
  lastRequestLookupStatus: LastRequestLookupStatus;
  confirmClientWindow: (requestToken: string) => void;
  openBookingFlow: () => void;
  refreshLastRequest: (requestToken: string) => Promise<PublicBookingRequest | null>;
  compact?: boolean;
}) {
  const currentRequestInfo = isActiveClientBooking(lastRequestInfo) ? lastRequestInfo : null;
  const completedVisitInfo = isFinishedClientVisit(lastRequestInfo) ? lastRequestInfo : null;
  const timelineIndex = getClientTimelineIndex(currentRequestInfo);
  const request = currentRequestInfo?.request ?? null;
  const windowLabel = currentRequestInfo?.window?.label ?? request?.customWindowText ?? "";
  const canConfirmWindow = canConfirmClientWindow(request?.status, currentRequestInfo?.window, request?.publicToken);

  if (lastRequestLookupStatus === "loading" && !lastRequestInfo) {
    return (
      <div className={`panel notice-panel booking-celebration client-status-panel${compact ? " compact" : ""}`}>
        <div className="client-status-heading">
          <span className="status new">Проверяю</span>
          <h3>Ищу последнюю запись</h3>
        </div>
      </div>
    );
  }

  if (!currentRequestInfo && !lastSubmittedRequestId) {
    return (
      <>
        <ClientNoActiveVisitPanel
          title={lastRequestLookupStatus === "stale" ? "Старая запись уже недоступна" : "Активных записей нет"}
          openBookingFlow={openBookingFlow}
          compact={compact}
        />
        <ClientVisitHistoryPanel lastRequestInfo={completedVisitInfo} />
      </>
    );
  }

  if (!currentRequestInfo) {
    if (completedVisitInfo) {
      return (
        <>
          <ClientNoActiveVisitPanel title="Активных записей нет" openBookingFlow={openBookingFlow} compact={compact} />
          <ClientVisitHistoryPanel lastRequestInfo={completedVisitInfo} />
        </>
      );
    }

    if (lastRequestInfo) {
      return (
        <ClientNoActiveVisitPanel
          title={lastRequestLookupStatus === "stale" ? "Старая запись уже недоступна" : "Активных записей нет"}
          openBookingFlow={openBookingFlow}
          compact={compact}
        />
      );
    }

    return (
      <div className={`panel notice-panel booking-celebration client-status-panel${compact ? " compact" : ""}`}>
        <div className="client-status-heading">
          <span className="status new">Вы отправили заявку</span>
          <h3>{lastSubmittedRequestId ? "Мастер скоро ответит" : "Вы отправили заявку"}</h3>
        </div>
        <ClientRequestTimeline activeIndex={timelineIndex} />
      </div>
    );
  }

  return (
    <div className={`panel notice-panel booking-celebration client-status-panel${compact ? " compact" : ""}`}>
      <div className="client-status-heading">
        <span className={`status ${currentRequestInfo.request.status}`}>{statusLabels[currentRequestInfo.request.status]}</span>
        <h3>Запись к мастеру</h3>
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
            className="ghost-button"
            onClick={() => {
              if (currentRequestInfo.request.publicToken) {
                void refreshLastRequest(currentRequestInfo.request.publicToken);
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

function ClientNoActiveVisitPanel({
  compact,
  openBookingFlow,
  title,
}: {
  compact: boolean;
  openBookingFlow: () => void;
  title: string;
}) {
  return (
    <div className={`panel client-empty-state-panel${compact ? " compact" : ""}`}>
      <h3>{title}</h3>
      {!compact ? (
        <button className="primary-button" onClick={openBookingFlow} type="button">
          <Send size={17} /> Записаться снова
        </button>
      ) : null}
    </div>
  );
}

function ClientVisitHistoryPanel({ lastRequestInfo }: { lastRequestInfo: PublicBookingRequest | null }) {
  if (!lastRequestInfo?.window) {
    return null;
  }

  return (
    <section className="panel client-status-history-panel">
      <p className="eyebrow">История</p>
      <div className="client-status-history-item">
        <strong>{formatDayLabel(lastRequestInfo.window.startAt)}</strong>
        <span>визит прошёл</span>
      </div>
    </section>
  );
}

const clientTimelineSteps = [
  "Вы отправили заявку",
  "Мастер скоро ответит",
  "Предложено время",
  "Вы записаны",
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

function canConfirmClientWindow(
  status: PublicBookingRequest["request"]["status"] | undefined,
  window: TimeWindow | null | undefined,
  publicToken: string | undefined,
) {
  return Boolean(
    status === "waiting_client" &&
      publicToken &&
      window &&
      window.status === "offered" &&
      isFutureDateTime(window.startAt),
  );
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
    { section: "profile", label: "Данные", icon: <UserRound size={18} /> },
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
