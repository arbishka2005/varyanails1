import type { Appointment, RequestStatus } from "../../src/types.js";
import { repository } from "../repositories/index.js";
import {
  notifyAppointmentCancelled,
  notifyAppointmentMoved,
  notifyBookingConfirmed,
  notifyRequestStatusChanged,
} from "../http/bookingEvents.js";

export type CommandResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: 404 | 409; error: string };

function dispatchNotification(task: Promise<void>) {
  task.catch((error: unknown) => {
    console.error("Notification dispatch failed:", error);
  });
}

export async function updateRequestStatusCommand(id: string, status: RequestStatus) {
  const result = await repository.updateRequestStatus(id, status);

  if (!result) {
    return { ok: false, status: 404, error: "Booking request not found" } satisfies CommandResult<never>;
  }

  if (result.changed) {
    dispatchNotification(notifyRequestStatusChanged(result.item));
  }

  return { ok: true, status: 200, data: result.item } satisfies CommandResult<typeof result.item>;
}

export async function updateRequestWindowCommand(
  id: string,
  preferredWindowId: string | null,
  customWindowText?: string,
) {
  const updated = await repository.updateRequestWindow(id, preferredWindowId, customWindowText);

  if (!updated) {
    return { ok: false, status: 404, error: "Booking request not found" } satisfies CommandResult<never>;
  }

  return { ok: true, status: 200, data: updated } satisfies CommandResult<typeof updated>;
}

export async function confirmRequestByMasterCommand(id: string) {
  const before = await repository.getBookingRequest(id);

  if (!before) {
    return { ok: false, status: 404, error: "Booking request not found" } satisfies CommandResult<never>;
  }

  const result = await repository.confirmBookingRequest(id);

  if (!result) {
    return { ok: false, status: 409, error: "Request cannot be confirmed" } satisfies CommandResult<never>;
  }

  if (result.created) {
    dispatchNotification(notifyBookingConfirmed(result.appointment, "master"));
  }

  return { ok: true, status: result.created ? 201 : 200, data: result.appointment } satisfies CommandResult<typeof result.appointment>;
}

export async function confirmRequestByClientTokenCommand(token: string) {
  const before = await repository.getBookingRequestByPublicToken(token);

  if (!before) {
    return { ok: false, status: 404, error: "Booking request not found" } satisfies CommandResult<never>;
  }

  const result = await repository.confirmBookingRequestByPublicToken(token);

  if (!result) {
    return { ok: false, status: 409, error: "Request cannot be confirmed by client" } satisfies CommandResult<never>;
  }

  if (result.created) {
    dispatchNotification(notifyBookingConfirmed(result.appointment, "client"));
  }

  return { ok: true, status: result.created ? 201 : 200, data: result.appointment } satisfies CommandResult<typeof result.appointment>;
}

export async function updateAppointmentStatusCommand(id: string, status: Appointment["status"]) {
  const result = await repository.updateAppointmentStatus(id, status);

  if (!result) {
    return { ok: false, status: 404, error: "Appointment not found" } satisfies CommandResult<never>;
  }

  if (result.changed && result.item.status === "cancelled") {
    dispatchNotification(notifyAppointmentCancelled(result.item));
  }

  return { ok: true, status: 200, data: result.item } satisfies CommandResult<typeof result.item>;
}

export async function moveAppointmentCommand(id: string, windowId: string) {
  const existing = await repository.getAppointment(id);

  if (!existing) {
    return { ok: false, status: 404, error: "Appointment not found" } satisfies CommandResult<never>;
  }

  const result = await repository.moveAppointment(id, windowId);

  if (!result) {
    return { ok: false, status: 409, error: "Appointment cannot be moved" } satisfies CommandResult<never>;
  }

  if (result.changed) {
    dispatchNotification(notifyAppointmentMoved(result.item, windowId));
  }

  return { ok: true, status: 200, data: result.item } satisfies CommandResult<typeof result.item>;
}

export async function deleteAppointmentCommand(id: string) {
  const result = await repository.deleteAppointment(id);

  if (!result) {
    return { ok: false, status: 404, error: "Appointment not found" } satisfies CommandResult<never>;
  }

  if (result.changed) {
    dispatchNotification(notifyAppointmentCancelled(result.item));
  }

  return { ok: true, status: 204, data: undefined } satisfies CommandResult<void>;
}

export async function submitAppointmentSurveyCommand(
  token: string,
  payload: { rating: number; text?: string },
) {
  const appointment = await repository.getAppointmentByPublicToken(token);

  if (!appointment) {
    return { ok: false, status: 404, error: "Appointment not found" } satisfies CommandResult<never>;
  }

  if (appointment.surveyRating) {
    return { ok: false, status: 409, error: "Survey already submitted" } satisfies CommandResult<never>;
  }

  const updated = await repository.submitAppointmentSurveyByPublicToken(token, payload);

  if (!updated) {
    return { ok: false, status: 409, error: "Survey already submitted" } satisfies CommandResult<never>;
  }

  return { ok: true, status: 201, data: updated } satisfies CommandResult<typeof updated>;
}
