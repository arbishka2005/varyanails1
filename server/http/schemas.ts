import { z } from "zod";
import { isValidDateRange } from "../../src/lib/dateTime.js";

export const contactChannelSchema = z.enum(["telegram", "vk", "phone"]);
export const nailLengthSchema = z.enum(["short", "medium", "long", "extra"]);
export const requestStatusSchema = z.enum([
  "new",
  "needs_clarification",
  "waiting_client",
  "confirmed",
  "declined",
]);
export const appointmentStatusSchema = z.enum(["scheduled", "completed", "cancelled", "no_show"]);
export const timeWindowStatusSchema = z.enum(["available", "offered", "reserved", "blocked"]);
export const serviceKindSchema = z.string().min(1);
export const serviceOptionKindSchema = z.string().min(1);

export const clientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1),
  preferredContactChannel: contactChannelSchema,
  contactHandle: z.string(),
  firstVisit: z.boolean(),
  telegramUserId: z.string().min(1).optional(),
  notes: z.string().optional(),
}).superRefine((value, context) => {
  if (value.preferredContactChannel !== "phone" && !value.contactHandle.trim()) {
    context.addIssue({
      code: "custom",
      message: "Contact handle is required for Telegram or VK",
      path: ["contactHandle"],
    });
  }
});

export const photoSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["hands", "reference"]),
  fileName: z.string().min(1),
  previewUrl: z.string().optional(),
});

export const uploadPhotoSchema = z.object({
  kind: z.enum(["hands", "reference"]),
  fileName: z.string().min(1),
  dataUrl: z.string().min(1),
});

export const bookingRequestSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  service: serviceKindSchema,
  optionIds: z.array(serviceOptionKindSchema),
  length: nailLengthSchema,
  desiredResult: z.string().min(1),
  photoIds: z.array(z.string()),
  preferredWindowId: z.string().nullable(),
  customWindowText: z.string().optional(),
  comment: z.string(),
  estimatedMinutes: z.number().int().nonnegative(),
  estimatedPriceFrom: z.number().int().nonnegative().optional(),
  status: requestStatusSchema,
  createdAt: z.string().min(1),
  masterNote: z.string().optional(),
  clarificationQuestion: z.string().optional(),
});

export const createBookingRequestSchema = z.object({
  client: clientSchema,
  photos: z.array(photoSchema),
  request: bookingRequestSchema.extend({
    status: z.literal("new"),
  }),
});

export const updateRequestStatusSchema = z.object({
  status: z.enum(["needs_clarification", "declined"]),
});

export const updateRequestWindowSchema = z.object({
  preferredWindowId: z.string().nullable(),
  customWindowText: z.string().optional(),
});

export const updateClientNotesSchema = z.object({
  notes: z.string().max(2500),
});

export const updateServiceSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  durationMinutes: z.number().int().min(15).max(600).optional(),
  priceFrom: z.number().int().min(0).max(1_000_000).nullable().optional(),
  requiresHandPhoto: z.boolean().optional(),
  requiresReference: z.boolean().optional(),
  allowsLengthSelection: z.boolean().optional(),
  options: z.array(serviceOptionKindSchema).optional(),
});

export const createServiceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(15).max(600),
  priceFrom: z.number().int().min(0).max(1_000_000).optional(),
  requiresHandPhoto: z.boolean(),
  requiresReference: z.boolean(),
  allowsLengthSelection: z.boolean().optional(),
  options: z.array(serviceOptionKindSchema),
});

export const updateServiceOptionSchema = z.object({
  title: z.string().min(1).optional(),
  durationMinutes: z.number().int().nonnegative().optional(),
  priceFrom: z.number().int().nonnegative().optional(),
});

export const createServiceOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  durationMinutes: z.number().int().nonnegative(),
  priceFrom: z.number().int().nonnegative().optional(),
});

export const createTimeWindowSchema = z.object({
  id: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  status: z.literal("available"),
  label: z.string().min(1),
}).refine((value) => isValidDateRange(value.startAt, value.endAt), {
  message: "Time window must end after it starts",
  path: ["endAt"],
});

export const updateTimeWindowStatusSchema = z.object({
  status: timeWindowStatusSchema,
});

export const moveAppointmentSchema = z.object({
  windowId: z.string().min(1),
});

export const updateAppointmentStatusSchema = z.object({
  status: appointmentStatusSchema,
});

export const appointmentSurveySchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional(),
});
