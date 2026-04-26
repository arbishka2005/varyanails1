import assert from "node:assert/strict";
import test from "node:test";
import { getClientHomeStatus } from "../../src/features/client/clientBookingState.js";
import type { BookingRequest, PublicBookingRequest, TimeWindow } from "../../src/types.js";

const baseRequest: BookingRequest = {
  id: "REQ-home-status",
  publicToken: "token-home-status",
  clientId: "client-home-status",
  service: "natural",
  optionIds: [],
  length: "short",
  desiredResult: "Покрытие",
  photoIds: [],
  preferredWindowId: "window-home-status",
  comment: "",
  estimatedMinutes: 120,
  status: "confirmed",
  createdAt: "2026-01-01T10:00:00.000Z",
};

function makeWindow(endAt: string): TimeWindow {
  return {
    id: "window-home-status",
    startAt: "2026-01-01T10:00:00.000Z",
    endAt,
    label: "1 января, 10:00-12:00",
    status: "reserved",
  };
}

function makePublicRequest(endAt: string): PublicBookingRequest {
  return {
    request: baseRequest,
    window: makeWindow(endAt),
  };
}

test("client home treats past confirmed appointment as history, not active", () => {
  const status = getClientHomeStatus({
    hasStoredAccess: true,
    lastRequestInfo: makePublicRequest("2000-01-01T12:00:00.000Z"),
    lookupStatus: "idle",
  });

  assert.equal(status.hasActiveBooking, false);
  assert.equal(status.activeRequestInfo, null);
  assert.equal(status.kind, "history");
});

test("client home treats server-completed appointment as non-active public history", () => {
  const status = getClientHomeStatus({
    hasStoredAccess: true,
    lastRequestInfo: makePublicRequest("2000-01-01T12:00:00.000Z"),
    lookupStatus: "idle",
  });

  assert.notEqual(status.kind, "upcoming");
  assert.equal(status.hasActiveBooking, false);
});

test("client home keeps upcoming confirmed appointment active", () => {
  const requestInfo = makePublicRequest("2099-01-01T12:00:00.000Z");
  const status = getClientHomeStatus({
    hasStoredAccess: true,
    lastRequestInfo: requestInfo,
    lookupStatus: "idle",
  });

  assert.equal(status.hasActiveBooking, true);
  assert.equal(status.activeRequestInfo, requestInfo);
  assert.equal(status.kind, "upcoming");
});

test("client home does not turn stale localStorage access into active badge", () => {
  const status = getClientHomeStatus({
    hasStoredAccess: true,
    lastRequestInfo: null,
    lookupStatus: "idle",
  });

  assert.equal(status.hasActiveBooking, false);
  assert.equal(status.activeRequestInfo, null);
  assert.equal(status.kind, "empty");
});
