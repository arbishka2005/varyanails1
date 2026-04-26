import assert from "node:assert/strict";
import test from "node:test";
import { getBookingPhotoVisibility } from "../../src/features/booking/photoRequirements.js";
import type { ServicePreset } from "../../src/types.js";

function makeService(patch: Partial<Pick<ServicePreset, "requiresHandPhoto" | "requiresReference">>): ServicePreset {
  return {
    id: "photo-test-service",
    title: "Photo test service",
    durationMinutes: 120,
    priceFrom: 1000,
    requiresHandPhoto: false,
    requiresReference: false,
    allowsLengthSelection: false,
    options: [],
    ...patch,
  };
}

test("repeat visit with service reference requirement still shows reference upload", () => {
  const repeatVisit = false;
  const visibility = getBookingPhotoVisibility(makeService({ requiresReference: true }));

  assert.equal(repeatVisit, false);
  assert.equal(visibility.needsPhotoStep, true);
  assert.equal(visibility.showReference, true);
  assert.equal(visibility.showHandPhoto, false);
});

test("repeat visit with service hand photo requirement still shows hand photo upload", () => {
  const repeatVisit = false;
  const visibility = getBookingPhotoVisibility(makeService({ requiresHandPhoto: true }));

  assert.equal(repeatVisit, false);
  assert.equal(visibility.needsPhotoStep, true);
  assert.equal(visibility.showHandPhoto, true);
  assert.equal(visibility.showReference, false);
});

test("service without photo requirements hides photo step", () => {
  const visibility = getBookingPhotoVisibility(makeService({}));

  assert.equal(visibility.needsPhotoStep, false);
  assert.equal(visibility.showHandPhoto, false);
  assert.equal(visibility.showReference, false);
});

test("first and repeat visit do not change service-based photo visibility", () => {
  const firstVisit = getBookingPhotoVisibility(makeService({ requiresHandPhoto: true, requiresReference: true }));
  const repeatVisit = getBookingPhotoVisibility(makeService({ requiresHandPhoto: true, requiresReference: true }));

  assert.deepEqual(repeatVisit, firstVisit);
  assert.equal(repeatVisit.showHandPhoto, true);
  assert.equal(repeatVisit.showReference, true);
});
