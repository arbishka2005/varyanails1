export type AdminSection = "dashboard" | "requests" | "schedule" | "clients" | "settings";

export type ClientSection = "home" | "booking" | "requests" | "profile";

export type AppRoute =
  | { portal: "client"; section: ClientSection }
  | { portal: "admin"; section: AdminSection }
  | { portal: "survey"; appointmentToken: string };

export type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

function getClientSection(path: string): ClientSection {
  if (path === "client/booking" || path === "booking") {
    return "booking";
  }

  if (path === "client/requests" || path === "requests") {
    return "requests";
  }

  if (path === "client/profile" || path === "profile") {
    return "profile";
  }

  return "home";
}

function getAdminSection(path: string): AdminSection {
  if (path === "admin/requests") {
    return "requests";
  }

  if (path === "admin/schedule") {
    return "schedule";
  }

  if (path === "admin/clients") {
    return "clients";
  }

  if (path === "admin/settings") {
    return "settings";
  }

  return "dashboard";
}

export function getStartParam(): string {
  const searchParams = new URLSearchParams(window.location.search);
  const queryParam =
    searchParams.get("startapp") ??
    searchParams.get("start_param") ??
    searchParams.get("tgWebAppStartParam") ??
    "";
  const webAppParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? "";
  return queryParam || webAppParam;
}

export function getRouteFromHash(): AppRoute {
  const rawHash = window.location.hash.replace(/^#\/?/, "");
  const isTelegramPayloadHash =
    rawHash.startsWith("tgWebAppData=") ||
    rawHash.startsWith("tgwebappdata=") ||
    rawHash.startsWith("tgWebAppData");
  const hash = isTelegramPayloadHash ? "" : rawHash;
  const fallbackPath = window.location.pathname.replace(/^\/+/, "");
  const startParam = getStartParam();
  const startParamPath = startParam.replace(/^\/+/, "");
  const isAdminStartParam = startParamPath.startsWith("admin");
  const isTelegramMiniApp = Boolean(
    window.Telegram?.WebApp?.initDataUnsafe?.user || window.Telegram?.WebApp?.initData,
  );
  const routePath = hash || fallbackPath || startParamPath;
  const [path, query] = routePath.split("?");

  if (path.startsWith("admin") && isTelegramMiniApp && !isAdminStartParam) {
    return { portal: "client", section: "home" };
  }

  if (path === "survey") {
    const params = new URLSearchParams(query ?? "");
    const appointmentToken = params.get("appointment");

    if (appointmentToken) {
      return { portal: "survey", appointmentToken };
    }
  }

  if (path === "admin" || path.startsWith("admin/")) {
    return { portal: "admin", section: getAdminSection(path) };
  }

  return { portal: "client", section: getClientSection(path) };
}

export function navigateTo(hash: string) {
  window.location.hash = hash;
}

export function navigateToClientSection(section: ClientSection) {
  navigateTo(`/client/${section}`);
}

export function navigateToAdminSection(section: AdminSection) {
  navigateTo(section === "dashboard" ? "/admin" : `/admin/${section}`);
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

export function getTelegramUser(): TelegramUser | undefined {
  return getTelegramWebApp()?.initDataUnsafe?.user;
}
