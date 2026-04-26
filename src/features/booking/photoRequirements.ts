import type { ServicePreset } from "../../types";

export function getBookingPhotoVisibility(
  service: Pick<ServicePreset, "requiresHandPhoto" | "requiresReference">,
) {
  const showHandPhoto = service.requiresHandPhoto;
  const showReference = service.requiresReference;

  return {
    needsPhotoStep: showHandPhoto || showReference,
    showHandPhoto,
    showReference,
  };
}
