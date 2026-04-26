import { isFutureDateTime } from "../../lib/dateTime";
import type { PublicBookingRequest } from "../../types";

type LastRequestLookupStatus = "idle" | "loading" | "stale";

export type ClientHomeStatusKind =
  | "empty"
  | "history"
  | "loading"
  | "needs_confirmation"
  | "pending"
  | "stale"
  | "upcoming";

export type ClientHomeStatus = {
  activeRequestInfo: PublicBookingRequest | null;
  hasActiveBooking: boolean;
  kind: ClientHomeStatusKind;
};

export function isFinishedClientVisit(lastRequestInfo: PublicBookingRequest | null) {
  return Boolean(
    lastRequestInfo?.request.status === "confirmed" &&
      lastRequestInfo.window &&
      !isFutureDateTime(lastRequestInfo.window.endAt),
  );
}

export function isActiveClientBooking(lastRequestInfo: PublicBookingRequest | null) {
  if (!lastRequestInfo || lastRequestInfo.request.status === "declined") {
    return false;
  }

  const windowIsFinished = Boolean(lastRequestInfo.window && !isFutureDateTime(lastRequestInfo.window.endAt));

  if (windowIsFinished) {
    return false;
  }

  if (lastRequestInfo.request.status === "confirmed") {
    return Boolean(lastRequestInfo.window);
  }

  return true;
}

export function getClientHomeStatus({
  hasStoredAccess,
  lastRequestInfo,
  lookupStatus,
}: {
  hasStoredAccess: boolean;
  lastRequestInfo: PublicBookingRequest | null;
  lookupStatus: LastRequestLookupStatus;
}): ClientHomeStatus {
  if (isActiveClientBooking(lastRequestInfo)) {
    const activeRequestInfo = lastRequestInfo!;
    const kind =
      activeRequestInfo.request.status === "confirmed"
        ? "upcoming"
        : activeRequestInfo.request.status === "waiting_client"
          ? "needs_confirmation"
          : "pending";

    return {
      activeRequestInfo,
      hasActiveBooking: true,
      kind,
    };
  }

  if (!lastRequestInfo && hasStoredAccess && lookupStatus === "loading") {
    return {
      activeRequestInfo: null,
      hasActiveBooking: false,
      kind: "loading",
    };
  }

  if (lookupStatus === "stale") {
    return {
      activeRequestInfo: null,
      hasActiveBooking: false,
      kind: "stale",
    };
  }

  return {
    activeRequestInfo: null,
    hasActiveBooking: false,
    kind: isFinishedClientVisit(lastRequestInfo) ? "history" : "empty",
  };
}
