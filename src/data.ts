import type {
  Appointment,
  BookingRequest,
  Client,
  PhotoAttachment,
  ServiceOption,
  ServicePreset,
  TimeWindow,
} from "./types";

export const serviceOptions: ServiceOption[] = [];

export const servicePresets: ServicePreset[] = [
  {
    id: "extension",
    title: "Наращивание",
    durationMinutes: 210,
    priceFrom: 3200,
    requiresHandPhoto: true,
    requiresReference: true,
    options: [],
  },
  {
    id: "correction",
    title: "Коррекция",
    durationMinutes: 150,
    priceFrom: 2500,
    requiresHandPhoto: false,
    requiresReference: true,
    options: [],
  },
  {
    id: "natural",
    title: "Покрытие на свои ногти",
    durationMinutes: 135,
    priceFrom: 2200,
    requiresHandPhoto: false,
    requiresReference: true,
    options: [],
  },
  {
    id: "manicure",
    title: "Маникюр без покрытия",
    durationMinutes: 75,
    priceFrom: 1200,
    requiresHandPhoto: false,
    requiresReference: false,
    options: [],
  },
  {
    id: "removal",
    title: "Снятие",
    durationMinutes: 45,
    priceFrom: 700,
    requiresHandPhoto: false,
    requiresReference: false,
    options: [],
  },
];

export const timeWindows: TimeWindow[] = [
  {
    id: "WIN-1504-1100",
    startAt: "2026-04-15T11:00:00+03:00",
    endAt: "2026-04-15T14:30:00+03:00",
    status: "available",
    label: "15 апреля, 11:00-14:30",
  },
  {
    id: "WIN-1504-1630",
    startAt: "2026-04-15T16:30:00+03:00",
    endAt: "2026-04-15T19:30:00+03:00",
    status: "offered",
    label: "15 апреля, 16:30-19:30",
  },
  {
    id: "WIN-1604-1000",
    startAt: "2026-04-16T10:00:00+03:00",
    endAt: "2026-04-16T13:00:00+03:00",
    status: "available",
    label: "16 апреля, 10:00-13:00",
  },
  {
    id: "WIN-1704-1230",
    startAt: "2026-04-17T12:30:00+03:00",
    endAt: "2026-04-17T15:30:00+03:00",
    status: "available",
    label: "17 апреля, 12:30-15:30",
  },
];

export const seedClients: Client[] = [
  {
    id: "CLI-1001",
    name: "Алина",
    phone: "+7 999 123-45-67",
    preferredContactChannel: "telegram",
    contactHandle: "@alina_nails",
    firstVisit: true,
    notes: "Новый клиент, проверить состояние ногтей по фото.",
  },
];

export const seedPhotos: PhotoAttachment[] = [
  {
    id: "PHOTO-HANDS-1001",
    kind: "hands",
    fileName: "hands-before.jpg",
  },
  {
    id: "PHOTO-REF-1001",
    kind: "reference",
    fileName: "milk-french-ref.jpg",
  },
];

export const seedRequests: BookingRequest[] = [
  {
    id: "REQ-1042",
    clientId: "CLI-1001",
    service: "extension",
    optionIds: [],
    length: "medium",
    desiredResult: "Молочная база, мягкий квадрат, френч на всех ногтях.",
    photoIds: ["PHOTO-HANDS-1001", "PHOTO-REF-1001"],
    preferredWindowId: "WIN-1504-1630",
    comment: "Ногти сейчас короткие, на двух есть сколы.",
    estimatedMinutes: 240,
    estimatedPriceFrom: 3700,
    status: "new",
    createdAt: "2026-04-12T10:30:00+03:00",
  },
];

export const seedAppointments: Appointment[] = [];
