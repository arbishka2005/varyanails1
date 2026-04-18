import type {
  Appointment,
  AppSnapshot,
  BookingRequest,
  Client,
  PhotoAttachment,
  PublicBookingAccess,
  PublicBookingConfig,
  RequestStatus,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../src/types.js";

export type { AppSnapshot, PublicBookingConfig } from "../../src/types.js";

export type ConfirmBookingResult = {
  appointment: Appointment;
  created: boolean;
};

export type MutationResult<T> = {
  item: T;
  changed: boolean;
};

export type Repository = {
  bootstrapSeedData: () => Promise<void>;
  getSnapshot: () => Promise<AppSnapshot>;
  getPublicBookingConfig: () => Promise<PublicBookingConfig>;
  getBookingRequest: (id: string) => Promise<BookingRequest | null>;
  getBookingRequestByPublicToken: (token: string) => Promise<BookingRequest | null>;
  getAppointment: (id: string) => Promise<Appointment | null>;
  getAppointmentByPublicToken: (token: string) => Promise<Appointment | null>;
  getTimeWindow: (id: string) => Promise<TimeWindow | null>;
  getClient: (id: string) => Promise<Client | null>;
  createBookingRequest: (payload: {
    client: Client;
    photos: PhotoAttachment[];
    request: BookingRequest;
  }) => Promise<PublicBookingAccess>;
  updateRequestStatus: (id: string, status: RequestStatus) => Promise<MutationResult<BookingRequest> | null>;
  updateRequestWindow: (
    id: string,
    preferredWindowId: string | null,
    customWindowText?: string,
  ) => Promise<BookingRequest | null>;
  updateClientNotes: (id: string, notes: string) => Promise<Client | null>;
  deleteClient: (id: string) => Promise<boolean>;
  createServiceOption: (option: ServiceOption) => Promise<ServiceOption>;
  updateServiceOption: (id: string, patch: Partial<ServiceOption>) => Promise<ServiceOption | null>;
  deleteServiceOption: (id: string) => Promise<boolean>;
  createService: (service: ServicePreset) => Promise<ServicePreset>;
  updateService: (
    id: string,
    patch: Omit<Partial<ServicePreset>, "priceFrom"> & { priceFrom?: number | null },
  ) => Promise<ServicePreset | null>;
  deleteService: (id: string) => Promise<boolean>;
  createTimeWindow: (window: TimeWindow) => Promise<TimeWindow>;
  updateTimeWindowStatus: (id: string, status: TimeWindowStatus) => Promise<TimeWindow | null>;
  moveAppointment: (appointmentId: string, windowId: string) => Promise<MutationResult<Appointment> | null>;
  updateAppointmentStatus: (id: string, status: Appointment["status"]) => Promise<MutationResult<Appointment> | null>;
  deleteAppointment: (id: string) => Promise<MutationResult<Appointment> | null>;
  markAppointmentReminder: (id: string, kind: "24h" | "3h", sentAt: string) => Promise<Appointment | null>;
  markAppointmentSurveySent: (id: string, sentAt: string) => Promise<Appointment | null>;
  submitAppointmentSurvey: (
    id: string,
    payload: { rating: number; text?: string },
  ) => Promise<Appointment | null>;
  submitAppointmentSurveyByPublicToken: (
    token: string,
    payload: { rating: number; text?: string },
  ) => Promise<Appointment | null>;
  confirmBookingRequest: (requestId: string) => Promise<ConfirmBookingResult | null>;
  confirmBookingRequestByClient: (requestId: string) => Promise<ConfirmBookingResult | null>;
  confirmBookingRequestByPublicToken: (token: string) => Promise<ConfirmBookingResult | null>;
};
