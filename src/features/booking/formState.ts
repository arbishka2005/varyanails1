import { timeWindows } from "../../data";
import { PHONE_PREFIX } from "../../lib/phone";
import type {
  ContactChannel,
  NailLength,
  PhotoAttachment,
  ServiceKind,
  ServiceOptionKind,
} from "../../types";

export type FormState = {
  clientName: string;
  phone: string;
  contactChannel: ContactChannel;
  contactHandle: string;
  isNewClient: boolean;
  service: ServiceKind;
  optionIds: ServiceOptionKind[];
  length: NailLength;
  desiredResult: string;
  handPhoto: PhotoAttachment | null;
  referencePhoto: PhotoAttachment | null;
  preferredWindowId: string;
  customWindowText: string;
  comment: string;
};

export const customWindowValue = "custom";
export type ClientFormStep = "service" | "time" | "photos" | "contact";
export type ClientFormatQuestion = "service" | "length" | "visit" | "details";

export type BookingDraftUiState = {
  currentStep: ClientFormStep;
  formatQuestion: ClientFormatQuestion;
};

export type BookingDraft = {
  version: 1;
  savedAt: string;
  form: FormState;
  ui: BookingDraftUiState;
};

export const BOOKING_DRAFT_STORAGE_KEY = "varyanails:bookingDraft:v1";
export const initialBookingDraftUiState: BookingDraftUiState = {
  currentStep: "service",
  formatQuestion: "service",
};

export const initialForm: FormState = {
  clientName: "",
  phone: PHONE_PREFIX,
  contactChannel: "telegram",
  contactHandle: "",
  isNewClient: true,
  service: "extension",
  optionIds: [],
  length: "medium",
  desiredResult: "",
  handPhoto: null,
  referencePhoto: null,
  preferredWindowId:
    timeWindows.find((window) => window.status === "available")?.id ??
    timeWindows[0]?.id ??
    customWindowValue,
  customWindowText: "",
  comment: "",
};
