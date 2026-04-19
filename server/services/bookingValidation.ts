import type { BookingRequest, PhotoAttachment, ServicePreset } from "../../src/types.js";
import { getLengthDurationBoost, normalizeLengthForService } from "../../src/lib/services.js";
import { DomainError } from "../lib/domainErrors.js";

export function assertBookingRequestMatchesService(
  request: BookingRequest,
  photos: PhotoAttachment[],
  service: ServicePreset | null | undefined,
) {
  if (!service) {
    throw new DomainError("Выбранная услуга больше недоступна.", 409);
  }

  const attachedPhotoIds = new Set(photos.map((photo) => photo.id));
  const requestPhotoIds = new Set(request.photoIds);
  const hasPhoto = (kind: PhotoAttachment["kind"]) =>
    photos.some((photo) => photo.kind === kind && requestPhotoIds.has(photo.id) && attachedPhotoIds.has(photo.id));

  if (service.requiresHandPhoto && !hasPhoto("hands")) {
    throw new DomainError("Для этой услуги нужно приложить фото рук.", 400);
  }

  if (service.requiresReference && !hasPhoto("reference")) {
    throw new DomainError("Для этой услуги нужен референс дизайна.", 400);
  }

  if (request.length !== normalizeLengthForService(request.length, service)) {
    throw new DomainError("Для этой услуги нельзя менять длину.", 400);
  }

  const minimumDuration = service.durationMinutes + getLengthDurationBoost(request.length, service);
  if (request.estimatedMinutes < minimumDuration) {
    throw new DomainError("Расчёт длительности не совпадает с выбранной услугой.", 400);
  }

  const minimumPrice = service.priceFrom ?? 0;
  if ((request.estimatedPriceFrom ?? 0) < minimumPrice) {
    throw new DomainError("Расчёт стоимости не совпадает с выбранной услугой.", 400);
  }
}
