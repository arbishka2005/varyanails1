export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
          };
          start_param?: string;
        };
        viewportHeight?: number;
        viewportStableHeight?: number;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        ready?: () => void;
        expand?: () => void;
        onEvent?: (eventType: "viewportChanged", callback: () => void) => void;
        offEvent?: (eventType: "viewportChanged", callback: () => void) => void;
      };
    };
  }
}
