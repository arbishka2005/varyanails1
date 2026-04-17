import type { ReactNode } from "react";
import { CalendarClock, ClipboardList, MoveRight, Settings, Sparkles, UserRound } from "lucide-react";
import type { AdminSection } from "../../app/navigation";

function getAdminNavItems(newRequestsCount: number) {
  return [
    {
      section: "dashboard" as const,
      label: "Сегодня",
      icon: <Sparkles size={18} />,
    },
    {
      section: "requests" as const,
      label: "Заявки",
      icon: <ClipboardList size={18} />,
      badge: newRequestsCount,
    },
    {
      section: "schedule" as const,
      label: "Окошки",
      icon: <CalendarClock size={18} />,
    },
    {
      section: "clients" as const,
      label: "Клиентки",
      icon: <UserRound size={18} />,
    },
    {
      section: "settings" as const,
      label: "Услуги",
      icon: <Settings size={18} />,
    },
  ];
}

export function AdminBottomNav({
  currentSection,
  newRequestsCount,
  onNavigate,
}: {
  currentSection: AdminSection;
  newRequestsCount: number;
  onNavigate: (section: AdminSection) => void;
}) {
  const items = getAdminNavItems(newRequestsCount);

  return (
    <nav className="admin-bottom-nav" aria-label="Навигация мастера">
      {items.map((item) => (
        <button
          aria-current={currentSection === item.section ? "page" : undefined}
          key={item.section}
          className={currentSection === item.section ? "active" : ""}
          onClick={() => onNavigate(item.section)}
          type="button"
        >
          <span className="admin-bottom-nav-icon">
            {item.icon}
            {item.section === "requests" && item.badge ? (
              <span className="admin-bottom-nav-badge">{item.badge > 9 ? "9+" : item.badge}</span>
            ) : null}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function AdminHeader({
  counts,
}: {
  counts: {
    newRequests: number;
    scheduledAppointments: number;
    availableWindows: number;
    clients: number;
  };
}) {
  return (
    <section className="topbar admin-topbar">
      <div className="admin-hero-copy">
        <p className="eyebrow">vvrnailss · личный кабинет</p>
        <h1>Привет, Варюша</h1>
        <p className="admin-hero-status">
          {counts.newRequests > 0
            ? `${counts.newRequests} клиентки ждут твоего решения`
            : counts.scheduledAppointments > 0
              ? `${counts.scheduledAppointments} записей на сегодня`
              : "Я - твоя помощница в nail-сервисе"}
        </p>
      </div>
    </section>
  );
}

export function AdminScreenHeader({
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
    <section className="panel admin-screen-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <button className="secondary-button" onClick={onAction} type="button">
          <MoveRight size={17} /> {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export type AdminNavItem = {
  section: AdminSection;
  label: string;
  icon: ReactNode;
  badge?: number;
};
