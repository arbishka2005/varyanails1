export type ContactChannel = "telegram" | "vk" | "phone";

export type RequestStatus =
  | "new"
  | "needs_clarification"
  | "waiting_client"
  | "confirmed"
  | "declined";

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export type TimeWindowStatus = "available" | "offered" | "reserved" | "blocked";

export type ServiceKind =
  | "extension"
  | "correction"
  | "natural"
  | "manicure"
  | "removal";

export type ServiceOptionKind =
  | "old_removal"
  | "foreign_removal"
  | "repair"
  | "french"
  | "simple_design"
  | "complex_design"
  | "strengthening";

export type NailLength = "short" | "medium" | "long" | "extra";

export type Client = {
  id: string;
  name: string;
  phone: string;
  preferredContactChannel: ContactChannel;
  contactHandle: string;
  firstVisit: boolean;
  notes?: string;
};

export type PhotoAttachment = {
  id: string;
  kind: "hands" | "reference";
  fileName: string;
  previewUrl?: string;
};

export type TimeWindow = {
  id: string;
  startAt: string;
  endAt: string;
  status: TimeWindowStatus;
  label: string;
};

export type ServiceOption = {
  id: ServiceOptionKind;
  title: string;
  durationMinutes: number;
  priceFrom?: number;
};

export type ServicePreset = {
  id: ServiceKind;
  title: string;
  durationMinutes: number;
  priceFrom?: number;
  requiresHandPhoto: boolean;
  requiresReference: boolean;
  options: ServiceOptionKind[];
};

export type BookingRequest = {
  id: string;
  clientId: string;
  service: ServiceKind;
  optionIds: ServiceOptionKind[];
  length: NailLength;
  desiredResult: string;
  photoIds: string[];
  preferredWindowId: string | null;
  customWindowText?: string;
  comment: string;
  estimatedMinutes: number;
  estimatedPriceFrom?: number;
  status: RequestStatus;
  createdAt: string;
  masterNote?: string;
  clarificationQuestion?: string;
};

export type Appointment = {
  id: string;
  requestId: string;
  clientId: string;
  service: ServiceKind;
  optionIds: ServiceOptionKind[];
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  masterNote?: string;
};

export type AppSnapshot = {
  clients: Client[];
  photos: PhotoAttachment[];
  requests: BookingRequest[];
  appointments: Appointment[];
  windows: TimeWindow[];
  services: ServicePreset[];
};
