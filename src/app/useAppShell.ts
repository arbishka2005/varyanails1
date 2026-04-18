import { useEffect, useState } from "react";
import {
  getRouteFromHash,
  getStartParam,
  getTelegramWebApp,
  navigateToAdminSection,
  navigateToClientSection,
  type AdminSection,
  type AppRoute,
  type ClientSection,
} from "./navigation";

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function useAppShell() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash());
  const telegramWebApp = getTelegramWebApp();
  const isTelegramMiniApp = Boolean(telegramWebApp);
  const telegramInitData = telegramWebApp?.initData ?? "";
  const telegramUser = telegramWebApp?.initDataUnsafe?.user;
  const startParam = getStartParam();
  const locationPath = window.location.pathname;
  const locationHash = window.location.hash;

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    scrollToPageTop();
    window.requestAnimationFrame(scrollToPageTop);
    window.setTimeout(scrollToPageTop, 250);
  }, [route.portal, "section" in route ? route.section : route.appointmentToken]);

  useEffect(() => {
    if (window.location.hash) {
      return;
    }

    const path = window.location.pathname.replace(/^\/+/, "");

    if (path.startsWith("admin") || path.startsWith("survey")) {
      window.location.hash = `/${path}`;
    }
  }, []);

  useEffect(() => {
    const webApp = getTelegramWebApp();

    if (!webApp) {
      return;
    }

    const updateViewportHeight = () => {
      const height = webApp.viewportStableHeight || webApp.viewportHeight;
      if (height) {
        document.documentElement.style.setProperty("--tg-viewport-height", `${height}px`);
      }
    };

    webApp.ready?.();
    webApp.expand?.();
    updateViewportHeight();
    webApp.onEvent?.("viewportChanged", updateViewportHeight);

    return () => {
      webApp.offEvent?.("viewportChanged", updateViewportHeight);
    };
  }, []);

  return {
    route,
    telegram: {
      isTelegramMiniApp,
      telegramInitData,
      telegramUser,
      startParam,
      locationPath,
      locationHash,
    },
    openClientSection: (section: ClientSection) => navigateToClientSection(section),
    openAdminSection: (section: AdminSection) => navigateToAdminSection(section),
  };
}
