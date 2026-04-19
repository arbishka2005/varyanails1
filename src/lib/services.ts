import type { NailLength, ServicePreset } from "../types";

const ownLengthValue: NailLength = "short";
const defaultServiceOrder = ["natural", "correction", "extension", "manicure"];

const lengthDurationBoost: Record<NailLength, number> = {
  short: 0,
  medium: 15,
  long: 30,
  extra: 45,
};

export function allowsLengthSelection(service: Pick<ServicePreset, "allowsLengthSelection"> | null | undefined) {
  return service?.allowsLengthSelection !== false;
}

export function normalizeLengthForService(length: NailLength, service: ServicePreset | null | undefined) {
  return allowsLengthSelection(service) ? length : ownLengthValue;
}

export function getLengthDurationBoost(length: NailLength, service: ServicePreset | null | undefined) {
  return lengthDurationBoost[normalizeLengthForService(length, service)];
}

export function compareServicesByDisplayOrder(left: ServicePreset, right: ServicePreset) {
  const leftIndex = defaultServiceOrder.indexOf(left.id);
  const rightIndex = defaultServiceOrder.indexOf(right.id);

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }

  return left.title.localeCompare(right.title, "ru");
}
