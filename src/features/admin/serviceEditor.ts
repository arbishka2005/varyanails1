import type { ServicePreset } from "../../types";

export type ServiceEditorState = {
  title: string;
  durationMinutes: string;
  priceFrom: string;
  requiresHandPhoto: boolean;
  requiresReference: boolean;
};

export function toServiceEditorState(service: ServicePreset): ServiceEditorState {
  return {
    title: service.title,
    durationMinutes: String(service.durationMinutes),
    priceFrom: service.priceFrom !== undefined ? String(service.priceFrom) : "",
    requiresHandPhoto: service.requiresHandPhoto,
    requiresReference: service.requiresReference,
  };
}

export function parseServiceEditor(state: ServiceEditorState | undefined, id: string): ServicePreset | null {
  if (!state) {
    return null;
  }

  const title = state.title.trim();
  const durationMinutes = Number(state.durationMinutes);
  const priceFrom = state.priceFrom.trim() ? Number(state.priceFrom) : undefined;

  if (!title || Number.isNaN(durationMinutes) || durationMinutes < 0) {
    return null;
  }

  if (priceFrom !== undefined && (Number.isNaN(priceFrom) || priceFrom < 0)) {
    return null;
  }

  return {
    id,
    title,
    durationMinutes,
    priceFrom,
    requiresHandPhoto: state.requiresHandPhoto,
    requiresReference: state.requiresReference,
    options: [],
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
