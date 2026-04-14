import type {
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
  ServiceOption,
  ServicePreset,
  TimeWindow,
  TimeWindowStatus,
} from "../../src/types.js";

export type AppSnapshot = {
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  appointments: Appointment[];
  windows: TimeWindow[];
  services: ServicePreset[];
  serviceOptions: ServiceOption[];
};

export type PublicBookingConfig = {
  services: ServicePreset[];
  windows: TimeWindow[];
  serviceOptions: ServiceOption[];
};

export type Repository = {
  bootstrapSeedData: () => Promise<void>;
  getSnapshot: () => Promise<AppSnapshot>;
  getPublicBookingConfig: () => Promise<PublicBookingConfig>;
  getBookingRequest: (id: string) => Promise<BookingRequest | null>;
  getAppointment: (id: string) => Promise<Appointment | null>;
  getTimeWindow: (id: string) => Promise<TimeWindow | null>;
  getClient: (id: string) => Promise<Client | null>;
  createBookingRequest: (payload: {
    client: Client;
    photos: PhotoAttachment[];
    request: BookingRequest;
  }) => Promise<void>;
  updateRequestStatus: (id: string, status: RequestStatus) => Promise<BookingRequest | null>;
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
  updateService: (id: string, patch: Partial<ServicePreset>) => Promise<ServicePreset | null>;
  deleteService: (id: string) => Promise<boolean>;
  createTimeWindow: (window: TimeWindow) => Promise<TimeWindow>;
  updateTimeWindowStatus: (id: string, status: TimeWindowStatus) => Promise<TimeWindow | null>;
  moveAppointment: (appointmentId: string, windowId: string) => Promise<Appointment | null>;
  updateAppointmentStatus: (id: string, status: Appointment["status"]) => Promise<Appointment | null>;
  markAppointmentReminder: (id: string, kind: "24h" | "3h", sentAt: string) => Promise<Appointment | null>;
  markAppointmentSurveySent: (id: string, sentAt: string) => Promise<Appointment | null>;
  submitAppointmentSurvey: (
    id: string,
    payload: { rating: number; text?: string },
  ) => Promise<Appointment | null>;
  confirmBookingRequest: (requestId: string) => Promise<Appointment | null>;
  confirmBookingRequestByClient: (requestId: string) => Promise<Appointment | null>;
};
