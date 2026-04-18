import type { ServicePreset } from "../../types";

export type ServiceEditorState = {
  title: string;
  durationMinutes: string;
  priceFrom: string;
  requiresHandPhoto: boolean;
  requiresReference: boolean;
};

export type ServiceEditorResult = {
  service: Omit<ServicePreset, "priceFrom"> & { priceFrom?: number | null };
  warning?: string;
};

const minDurationMinutes = 15;
const maxDurationMinutes = 600;
const maxPriceFrom = 1_000_000;

export function toServiceEditorState(service: ServicePreset): ServiceEditorState {
  return {
    title: service.title,
    durationMinutes: String(service.durationMinutes),
    priceFrom: service.priceFrom !== undefined ? String(service.priceFrom) : "",
    requiresHandPhoto: service.requiresHandPhoto,
    requiresReference: service.requiresReference,
  };
}

export function parseServiceEditor(state: ServiceEditorState | undefined, id: string): ServiceEditorResult | null {
  if (!state) {
    return null;
  }

  const title = state.title.trim().replace(/\s+/g, " ");
  const durationMinutes = Number(state.durationMinutes);
  const priceFrom = state.priceFrom.trim() ? Number(state.priceFrom) : null;

  if (!title || title.length > 80) {
    return null;
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < minDurationMinutes ||
    durationMinutes > maxDurationMinutes
  ) {
    return null;
  }

  if (priceFrom !== null && (!Number.isInteger(priceFrom) || priceFrom < 0 || priceFrom > maxPriceFrom)) {
    return null;
  }

  return {
    service: {
      id,
      title,
      durationMinutes,
      priceFrom,
      requiresHandPhoto: state.requiresHandPhoto,
      requiresReference: state.requiresReference,
      options: [],
    },
    warning: durationMinutes >= 300 ? "Проверьте длительность: услуга длиннее 5 часов." : undefined,
  };
}

export function makeServiceId(title: string, existingIds: string[]) {
  const normalized = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  const baseId = normalized || `service-${Date.now()}`;
  let candidate = baseId;
  let index = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }

  return candidate;
}
