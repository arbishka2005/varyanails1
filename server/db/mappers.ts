import type {
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  ServicePreset,
  TimeWindow,
} from "../../src/types.js";

export function toClient(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone),
    preferredContactChannel: row.preferred_contact_channel as Client["preferredContactChannel"],
    contactHandle: String(row.contact_handle),
    firstVisit: Boolean(row.first_visit),
    notes: row.notes ? String(row.notes) : undefined,
  };
}

export function toPhoto(row: Record<string, unknown>): PhotoAttachment {
  return {
    id: String(row.id),
    kind: row.kind as PhotoAttachment["kind"],
    fileName: String(row.file_name),
    previewUrl: row.preview_url ? String(row.preview_url) : undefined,
  };
}

export function toService(row: Record<string, unknown>): ServicePreset {
  return {
    id: row.id as ServicePreset["id"],
    title: String(row.title),
    durationMinutes: Number(row.duration_minutes),
    priceFrom: row.price_from === null ? undefined : Number(row.price_from),
    requiresHandPhoto: Boolean(row.requires_hand_photo),
    requiresReference: Boolean(row.requires_reference),
    options: Array.isArray(row.options) ? (row.options as ServicePreset["options"]) : [],
  };
}

export function toTimeWindow(row: Record<string, unknown>): TimeWindow {
  return {
    id: String(row.id),
    startAt: new Date(String(row.start_at)).toISOString(),
    endAt: new Date(String(row.end_at)).toISOString(),
    status: row.status as TimeWindow["status"],
    label: String(row.label),
  };
}

export function toBookingRequest(row: Record<string, unknown>): BookingRequest {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    service: row.service as BookingRequest["service"],
    optionIds: Array.isArray(row.option_ids) ? (row.option_ids as BookingRequest["optionIds"]) : [],
    length: row.length as BookingRequest["length"],
    desiredResult: String(row.desired_result),
    photoIds: Array.isArray(row.photo_ids) ? (row.photo_ids as BookingRequest["photoIds"]) : [],
    preferredWindowId: row.preferred_window_id ? String(row.preferred_window_id) : null,
    customWindowText: row.custom_window_text ? String(row.custom_window_text) : undefined,
    comment: String(row.comment ?? ""),
    estimatedMinutes: Number(row.estimated_minutes),
    estimatedPriceFrom: row.estimated_price_from === null ? undefined : Number(row.estimated_price_from),
    status: row.status as BookingRequest["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    masterNote: row.master_note ? String(row.master_note) : undefined,
    clarificationQuestion: row.clarification_question ? String(row.clarification_question) : undefined,
  };
}

export function toAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    clientId: String(row.client_id),
    service: row.service as Appointment["service"],
    optionIds: Array.isArray(row.option_ids) ? (row.option_ids as Appointment["optionIds"]) : [],
    startAt: new Date(String(row.start_at)).toISOString(),
    endAt: new Date(String(row.end_at)).toISOString(),
    durationMinutes: Number(row.duration_minutes),
    status: row.status as Appointment["status"],
    masterNote: row.master_note ? String(row.master_note) : undefined,
  };
}
