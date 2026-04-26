import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ApiError, api, getApiErrorMessage } from "../api";
import { servicePresets } from "../data";
import {
  BOOKING_DRAFT_STORAGE_KEY,
  initialBookingDraftUiState,
  initialForm,
  type BookingDraft,
  type BookingDraftUiState,
  type ClientFormatQuestion,
  type ClientFormStep,
  type FormState,
} from "../features/booking/formState";
import { getClientHomeStatus } from "../features/client/clientBookingState";
import { lengthLabels } from "../lib/bookingPresentation";
import { getCurrentIsoTimestamp, isFutureDateTime } from "../lib/dateTime";
import { readFileAsDataUrl } from "../lib/file";
import { toStoredPhone } from "../lib/phone";
import { allowsLengthSelection, getLengthDurationBoost, normalizeLengthForService } from "../lib/services";
import type {
  BookingRequest,
  Client,
  PhotoAttachment,
  PublicBookingAccess,
  PublicBookingConfig,
  PublicBookingRequest,
  ServiceKind,
  ServicePreset,
  TimeWindow,
} from "../types";
import { getTelegramUser, navigateToClientSection, type AppRoute } from "./navigation";

const LAST_REQUEST_STORAGE_KEY = "varyanails:lastRequestAccess";
const clientFormSteps: ClientFormStep[] = ["service", "time", "photos", "contact"];
const clientFormatQuestions: ClientFormatQuestion[] = ["service", "length", "visit", "details"];

type LastRequestAccess = PublicBookingAccess;
type LastRequestLookupStatus = "idle" | "loading" | "stale";

type UseClientBookingFlowOptions = {
  route: AppRoute;
  services: ServicePreset[];
  windows: TimeWindow[];
  refreshPublicConfig: () => Promise<PublicBookingConfig | null>;
  setApiError: Dispatch<SetStateAction<string | null>>;
};

function makeClientScopedId(prefix: "CLI" | "REQ") {
  const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${randomPart}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPhotoAttachmentDraft(value: unknown): value is PhotoAttachment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "hands" || value.kind === "reference") &&
    typeof value.fileName === "string" &&
    (value.previewUrl === undefined || typeof value.previewUrl === "string")
  );
}

function normalizeDraftForm(value: unknown): FormState | null {
  if (!isRecord(value)) {
    return null;
  }

  const contactChannel =
    value.contactChannel === "telegram" || value.contactChannel === "vk" || value.contactChannel === "phone"
      ? value.contactChannel
      : initialForm.contactChannel;
  const length =
    value.length === "short" || value.length === "medium" || value.length === "long" || value.length === "extra"
      ? value.length
      : initialForm.length;

  return {
    clientName: typeof value.clientName === "string" ? value.clientName : initialForm.clientName,
    phone: typeof value.phone === "string" ? value.phone : initialForm.phone,
    contactChannel,
    contactHandle: typeof value.contactHandle === "string" ? value.contactHandle : initialForm.contactHandle,
    isNewClient: typeof value.isNewClient === "boolean" ? value.isNewClient : initialForm.isNewClient,
    service: typeof value.service === "string" && value.service ? value.service : initialForm.service,
    optionIds: Array.isArray(value.optionIds)
      ? value.optionIds.filter((optionId): optionId is string => typeof optionId === "string")
      : initialForm.optionIds,
    length,
    desiredResult: typeof value.desiredResult === "string" ? value.desiredResult : initialForm.desiredResult,
    handPhotos: [
      ...(Array.isArray(value.handPhotos) ? value.handPhotos.filter(isPhotoAttachmentDraft) : []),
      ...(isPhotoAttachmentDraft(value.handPhoto) ? [value.handPhoto] : []),
    ],
    referencePhotos: [
      ...(Array.isArray(value.referencePhotos) ? value.referencePhotos.filter(isPhotoAttachmentDraft) : []),
      ...(isPhotoAttachmentDraft(value.referencePhoto) ? [value.referencePhoto] : []),
    ],
    preferredWindowId:
      typeof value.preferredWindowId === "string" && value.preferredWindowId
        ? value.preferredWindowId
        : initialForm.preferredWindowId,
    customWindowText: initialForm.customWindowText,
    comment: typeof value.comment === "string" ? value.comment : initialForm.comment,
  };
}

function normalizeDraftUi(value: unknown): BookingDraftUiState {
  if (!isRecord(value)) {
    return initialBookingDraftUiState;
  }

  const currentStep = clientFormSteps.includes(value.currentStep as ClientFormStep)
    ? (value.currentStep as ClientFormStep)
    : initialBookingDraftUiState.currentStep;
  const formatQuestion = clientFormatQuestions.includes(value.formatQuestion as ClientFormatQuestion)
    ? (value.formatQuestion as ClientFormatQuestion)
    : initialBookingDraftUiState.formatQuestion;

  return { currentStep, formatQuestion };
}

function clearBookingDraftStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in strict browser modes.
  }
}

function clearLastRequestAccessStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(LAST_REQUEST_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in strict browser modes.
  }
}

function readBookingDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    const form = normalizeDraftForm(parsed.form);

    if (form) {
      return {
        form,
        ui: normalizeDraftUi(parsed.ui),
      };
    }
  } catch {
    // Ignore stale or corrupted draft and clear it below.
  }

  clearBookingDraftStorage();
  return null;
}

function isInitialBookingDraft(form: FormState, ui: BookingDraftUiState) {
  return (
    JSON.stringify(form) === JSON.stringify(initialForm) &&
    ui.currentStep === initialBookingDraftUiState.currentStep &&
    ui.formatQuestion === initialBookingDraftUiState.formatQuestion
  );
}

function readLastRequestAccess() {
  if (typeof window === "undefined") {
    return null;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(LAST_REQUEST_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LastRequestAccess>;

    if (
      typeof parsed.requestId === "string" &&
      parsed.requestId.trim() &&
      typeof parsed.publicToken === "string" &&
      parsed.publicToken.trim()
    ) {
      return {
        requestId: parsed.requestId.trim(),
        publicToken: parsed.publicToken.trim(),
      } satisfies LastRequestAccess;
    }
  } catch {
    // Ignore stale value from older builds and clear it below.
  }

  clearLastRequestAccessStorage();

  return null;
}

export function useClientBookingFlow({
  route,
  services,
  windows,
  refreshPublicConfig,
  setApiError,
}: UseClientBookingFlowOptions) {
  const [lastRequestAccess, setLastRequestAccess] = useState<LastRequestAccess | null>(() => readLastRequestAccess());
  const [lastRequestInfo, setLastRequestInfo] = useState<PublicBookingRequest | null>(null);
  const [lastRequestLookupStatus, setLastRequestLookupStatus] = useState<LastRequestLookupStatus>("idle");
  const [initialBookingDraft] = useState(() => readBookingDraft());
  const [form, setForm] = useState<FormState>(() => initialBookingDraft?.form ?? initialForm);
  const [bookingDraftUi, setBookingDraftUi] = useState<BookingDraftUiState>(
    () => initialBookingDraft?.ui ?? initialBookingDraftUiState,
  );
  const [uploading, setUploading] = useState({ hands: false, reference: false });
  const [uploadError, setUploadError] = useState({ hands: "", reference: "" });
  const submitInFlightRef = useRef(false);
  const clientConfirmInFlightRef = useRef(new Set<string>());
  const uploadInFlightCountRef = useRef<Record<"hands" | "reference", number>>({ hands: 0, reference: 0 });
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.service) ?? services[0] ?? servicePresets[0],
    [form.service, services],
  );

  const estimatedMinutes = useMemo(() => {
    return selectedService.durationMinutes + getLengthDurationBoost(form.length, selectedService);
  }, [form.length, selectedService]);

  const estimatedPriceFrom = useMemo(() => selectedService.priceFrom ?? 0, [selectedService.priceFrom]);

  const normalizedDesiredResult = useMemo(() => {
    const customText = form.desiredResult.trim();

    if (customText) {
      return customText;
    }

    if (!allowsLengthSelection(selectedService)) {
      return selectedService.title;
    }

    return [selectedService.title, lengthLabels[form.length]].join(" - ");
  }, [form.desiredResult, form.length, selectedService]);

  const availableBookingWindows = useMemo(
    () => windows.filter((window) => window.status === "available" && isFutureDateTime(window.startAt)),
    [windows],
  );
  const clientHomeStatus = getClientHomeStatus({
    hasStoredAccess: Boolean(lastRequestAccess),
    lastRequestInfo,
    lookupStatus: lastRequestLookupStatus,
  });
  const lastSubmittedRequestId = clientHomeStatus.hasActiveBooking
    ? lastRequestAccess?.requestId ?? lastRequestInfo?.request.id ?? null
    : null;
  const hasClientRequest = clientHomeStatus.hasActiveBooking;

  const setBookingDraftStep = (value: ClientFormStep | ((current: ClientFormStep) => ClientFormStep)) => {
    setBookingDraftUi((current) => ({
      ...current,
      currentStep: typeof value === "function" ? value(current.currentStep) : value,
    }));
  };

  const setBookingDraftFormatQuestion = (
    value: ClientFormatQuestion | ((current: ClientFormatQuestion) => ClientFormatQuestion),
  ) => {
    setBookingDraftUi((current) => ({
      ...current,
      formatQuestion: typeof value === "function" ? value(current.formatQuestion) : value,
    }));
  };

  const refreshLastRequest = async (publicToken: string) => {
    setLastRequestLookupStatus("loading");

    try {
      const info = await api.getPublicBookingRequest(publicToken);
      setLastRequestInfo(info);
      if (info.request.publicToken) {
        setLastRequestAccess({
          requestId: info.request.id,
          publicToken: info.request.publicToken,
        });
      }
      setLastRequestLookupStatus("idle");
      return info;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setLastRequestInfo(null);
        setLastRequestAccess(null);
        clearLastRequestAccessStorage();
        setLastRequestLookupStatus("stale");
        return null;
      }

      setLastRequestLookupStatus("idle");
      setApiError(getApiErrorMessage(error, "Не удалось обновить запись"));
      return null;
    }
  };

  useEffect(() => {
    const user = getTelegramUser();

    if (!user) {
      return;
    }

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    const handle = user.username ? `@${user.username}` : "";

    setForm((current) => ({
      ...current,
      clientName: current.clientName || fullName,
      contactChannel: "telegram",
      contactHandle: current.contactHandle || handle,
    }));
  }, []);

  useEffect(() => {
    if (route.portal !== "client" || !lastRequestAccess?.publicToken) {
      return;
    }

    void refreshLastRequest(lastRequestAccess.publicToken);
  }, [lastRequestAccess?.publicToken, route.portal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (lastRequestAccess) {
        window.localStorage.setItem(LAST_REQUEST_STORAGE_KEY, JSON.stringify(lastRequestAccess));
        return;
      }

      window.localStorage.removeItem(LAST_REQUEST_STORAGE_KEY);
    } catch {
      // Status history is optional; keep the app usable if persistence fails.
    }
  }, [lastRequestAccess]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (route.portal !== "client" || route.section !== "booking") {
      return;
    }

    if (isInitialBookingDraft(form, bookingDraftUi)) {
      clearBookingDraftStorage();
      return;
    }

    const draft: BookingDraft = {
      version: 1,
      savedAt: getCurrentIsoTimestamp(),
      form,
      ui: bookingDraftUi,
    };

    try {
      window.localStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore quota/private-mode errors. The booking flow must remain usable.
    }
  }, [bookingDraftUi, form, route]);

  useEffect(() => {
    if (!services.length) {
      return;
    }

    setForm((current) => {
      if (services.some((service) => service.id === current.service)) {
        return current;
      }

      return {
        ...current,
        service: services[0].id,
      };
    });
  }, [services]);

  useEffect(() => {
    if (allowsLengthSelection(selectedService)) {
      return;
    }

    const normalizedLength = normalizeLengthForService(form.length, selectedService);
    if (form.length !== normalizedLength) {
      setForm((current) => ({ ...current, length: normalizedLength }));
    }
  }, [form.length, selectedService]);

  const submitRequest = async () => {
    if (submitInFlightRef.current) {
      return false;
    }

    submitInFlightRef.current = true;
    setIsSubmittingRequest(true);

    const latestConfig = await refreshPublicConfig();
    if (!latestConfig) {
      setApiError("Не удалось обновить свободные окошки. Попробуйте ещё раз.");
      submitInFlightRef.current = false;
      setIsSubmittingRequest(false);
      return false;
    }

    const selectedWindow = latestConfig.windows.find(
      (window) =>
        window.id === form.preferredWindowId &&
        window.status === "available" &&
        isFutureDateTime(window.startAt),
    );

    if (!selectedWindow) {
      setForm((current) => ({ ...current, preferredWindowId: "", customWindowText: "" }));
      setBookingDraftUi((current) => ({ ...current, currentStep: "time" }));
      setApiError("Это окошко уже недоступно. Выберите другое.");
      submitInFlightRef.current = false;
      setIsSubmittingRequest(false);
      return false;
    }

    const client: Client = {
      id: makeClientScopedId("CLI"),
      name: form.clientName.trim(),
      phone: toStoredPhone(form.phone),
      preferredContactChannel: form.contactChannel,
      contactHandle: form.contactHandle.trim(),
      firstVisit: form.isNewClient,
    };
    const newPhotos: PhotoAttachment[] = [...form.handPhotos, ...form.referencePhotos];
    const request: BookingRequest = {
      id: makeClientScopedId("REQ"),
      clientId: client.id,
      service: form.service,
      optionIds: form.optionIds,
      length: normalizeLengthForService(form.length, selectedService),
      desiredResult: normalizedDesiredResult,
      photoIds: newPhotos.map((photo) => photo.id),
      preferredWindowId: selectedWindow.id,
      customWindowText: undefined,
      comment: form.comment.trim(),
      estimatedMinutes,
      estimatedPriceFrom,
      status: "new",
      createdAt: getCurrentIsoTimestamp(),
    };

    try {
      setApiError(null);
      const access = await api.createBookingRequest({ client, photos: newPhotos, request });
      setLastRequestAccess(access);
      await refreshLastRequest(access.publicToken);
      clearBookingDraftStorage();
      setBookingDraftUi(initialBookingDraftUiState);
      setForm(initialForm);
      navigateToClientSection("requests");
      return true;
    } catch (error) {
      const message = getApiErrorMessage(error, "Не удалось отправить запись");
      const refreshedConfig = await refreshPublicConfig();
      const refreshedWindows = refreshedConfig?.windows ?? [];
      const stillAvailable = refreshedWindows.some(
        (window) =>
          window.id === selectedWindow.id &&
          window.status === "available" &&
          isFutureDateTime(window.startAt),
      );

      if (!stillAvailable) {
        setForm((current) => ({ ...current, preferredWindowId: "", customWindowText: "" }));
        setBookingDraftUi((current) => ({ ...current, currentStep: "time" }));
      }
      setApiError(message);
      return false;
    } finally {
      submitInFlightRef.current = false;
      setIsSubmittingRequest(false);
    }
  };

  const confirmClientWindow = async (requestToken: string) => {
    if (clientConfirmInFlightRef.current.has(requestToken)) {
      return;
    }

    clientConfirmInFlightRef.current.add(requestToken);
    try {
      setApiError(null);
      await api.confirmPublicBookingRequest(requestToken);
      await refreshLastRequest(requestToken);
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Не удалось подтвердить время"));
      await refreshLastRequest(requestToken);
    } finally {
      clientConfirmInFlightRef.current.delete(requestToken);
    }
  };

  const uploadPhoto = async (kind: PhotoAttachment["kind"], file: File) => {
    const key = kind === "hands" ? "hands" : "reference";

    uploadInFlightCountRef.current[key] += 1;
    setUploading((current) => ({ ...current, [key]: true }));
    setUploadError((current) => ({ ...current, [key]: "" }));

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await api.uploadPhoto({
        kind,
        fileName: file.name,
        dataUrl,
      });

      setForm((current) => ({
        ...current,
        handPhotos:
          kind === "hands" && !current.handPhotos.some((photo) => photo.id === uploaded.id)
            ? [...current.handPhotos, uploaded]
            : current.handPhotos,
        referencePhotos:
          kind === "reference" && !current.referencePhotos.some((photo) => photo.id === uploaded.id)
            ? [...current.referencePhotos, uploaded]
            : current.referencePhotos,
      }));
      return uploaded;
    } catch (error) {
      const message = getApiErrorMessage(error, "Не удалось загрузить фото");
      setUploadError((current) => ({ ...current, [key]: message }));
      return null;
    } finally {
      uploadInFlightCountRef.current[key] = Math.max(0, uploadInFlightCountRef.current[key] - 1);
      if (uploadInFlightCountRef.current[key] === 0) {
        setUploading((current) => ({ ...current, [key]: false }));
      }
    }
  };

  const removePhoto = (photoId: string) => {
    setForm((current) => ({
      ...current,
      handPhotos: current.handPhotos.filter((photo) => photo.id !== photoId),
      referencePhotos: current.referencePhotos.filter((photo) => photo.id !== photoId),
    }));
  };

  const openBookingFlow = (serviceId?: ServiceKind) => {
    if (serviceId) {
      setForm((current) => ({ ...current, service: serviceId }));
    }

    navigateToClientSection("booking");
  };

  return {
    form,
    bookingDraftUi,
    selectedService,
    estimatedMinutes,
    estimatedPriceFrom,
    availableBookingWindows,
    lastRequestInfo,
    lastSubmittedRequestId,
    lastRequestLookupStatus,
    hasClientRequest,
    uploading,
    uploadError,
    isSubmittingRequest,
    setForm,
    setBookingDraftStep,
    setBookingDraftFormatQuestion,
    openBookingFlow,
    submitRequest,
    confirmClientWindow,
    refreshLastRequest,
    uploadPhoto,
    removePhoto,
  };
}
