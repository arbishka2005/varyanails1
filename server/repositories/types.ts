import type {
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  RequestStatus,
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
};

export type PublicBookingConfig = {
  services: ServicePreset[];
  windows: TimeWindow[];
};

export type Repository = {
  bootstrapSeedData: () => Promise<void>;
  getSnapshot: () => Promise<AppSnapshot>;
  getPublicBookingConfig: () => Promise<PublicBookingConfig>;
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
  updateService: (id: string, patch: Partial<ServicePreset>) => Promise<ServicePreset | null>;
  createTimeWindow: (window: TimeWindow) => Promise<TimeWindow>;
  updateTimeWindowStatus: (id: string, status: TimeWindowStatus) => Promise<TimeWindow | null>;
  confirmBookingRequest: (requestId: string) => Promise<Appointment | null>;
};
