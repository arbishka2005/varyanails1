import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  ImagePlus,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Info } from "../../components/Info";
import { PhotoGallery, PhotoLightbox } from "../../components/PhotoGallery";
import {
  contactLabels,
  formatTimeRange,
  groupWindowsByDate,
  lengthLabels,
} from "../../lib/bookingPresentation";
import { getLocalDateKey } from "../../lib/dateTime";
import { getTelegramWebApp } from "../../app/navigation";
import { isPhoneComplete, normalizePhoneInput } from "../../lib/phone";
import { allowsLengthSelection, normalizeLengthForService } from "../../lib/services";
import {
  type ClientFormatQuestion,
  type ClientFormStep,
  type FormState,
} from "./formState";
import { getBookingPhotoVisibility } from "./photoRequirements";
import type { ContactChannel, PhotoAttachment, ServicePreset, TimeWindow } from "../../types";

type StepDefinition = {
  id: ClientFormStep;
  label: string;
  title: string;
  cta: string;
};

type UploadCardProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  title: string;
  caption: string;
  files: PhotoAttachment[];
  error: string;
  isLoading: boolean;
  isRequired: boolean;
  maxCount: number;
  onFilesSelect: (files: File[]) => void;
  onOpenPhoto: (photo: PhotoAttachment) => void;
  onRemovePhoto: (photoId: string) => void;
};

const fullFormatQuestionOrder: ClientFormatQuestion[] = ["service", "length", "visit", "details"];
const ownLengthFormatQuestionOrder: ClientFormatQuestion[] = ["service", "visit", "details"];

const visitChoices = [
  { value: true, label: "Первый визит", hint: "покажу фото рук" },
  { value: false, label: "Уже была", hint: "быстрый повтор" },
] as const;

const contactChoices: { value: ContactChannel; label: string; icon: LucideIcon }[] = [
  { value: "telegram", label: "Telegram", icon: MessageCircle },
  { value: "vk", label: "VK", icon: MessageCircle },
  { value: "phone", label: "Телефон", icon: Phone },
];

export function ClientRequestForm({
  form,
  estimatedMinutes,
  estimatedPriceFrom,
  services,
  selectedService,
  availableWindows,
  currentStep,
  formatQuestion,
  setForm,
  setCurrentStep,
  setFormatQuestion,
  submitRequest,
  uploadPhoto,
  removePhoto,
  uploading,
  uploadError,
  isSubmitting,
}: {
  form: FormState;
  estimatedMinutes: number;
  estimatedPriceFrom: number;
  services: ServicePreset[];
  selectedService: ServicePreset;
  availableWindows: TimeWindow[];
  currentStep: ClientFormStep;
  formatQuestion: ClientFormatQuestion;
  setForm: Dispatch<SetStateAction<FormState>>;
  setCurrentStep: Dispatch<SetStateAction<ClientFormStep>>;
  setFormatQuestion: Dispatch<SetStateAction<ClientFormatQuestion>>;
  submitRequest: () => Promise<boolean>;
  uploadPhoto: (kind: PhotoAttachment["kind"], file: File) => Promise<PhotoAttachment | null>;
  removePhoto: (photoId: string) => void;
  uploading: { hands: boolean; reference: boolean };
  uploadError: { hands: string; reference: string };
  isSubmitting: boolean;
}) {
  const maxPhotoSizeBytes = 8 * 1024 * 1024;
  const maxHandPhotos = 4;
  const maxReferencePhotos = 6;
  const handInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const formatAdvanceTimerRef = useRef<number | null>(null);
  const didMountScrollRef = useRef(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAttachment | null>(null);
  const [fileValidationError, setFileValidationError] = useState({ hands: "", reference: "" });
  const [showErrors, setShowErrors] = useState<Record<ClientFormStep, boolean>>({
    service: false,
    time: false,
    photos: false,
    contact: false,
  });

  const patchForm = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const { needsPhotoStep, showHandPhoto, showReference } = getBookingPhotoVisibility(selectedService);
  const canSelectLength = allowsLengthSelection(selectedService);
  const formatQuestionOrder = canSelectLength ? fullFormatQuestionOrder : ownLengthFormatQuestionOrder;
  const steps = useMemo(
    () =>
      [
        {
          id: "service",
          label: "Формат",
          title: "Что делаем?",
          cta: "Выбрать время",
        },
        {
          id: "time",
          label: "Время",
          title: "Когда удобно?",
          cta: needsPhotoStep ? "Дальше" : "Контакты",
        },
        ...(needsPhotoStep
          ? ([
              {
                id: "photos",
                label: "Фото",
                title: "Добавьте фото",
                cta: "Контакты",
              },
            ] satisfies StepDefinition[])
          : []),
        {
          id: "contact",
          label: "Контакт",
          title: "Куда ответить?",
          cta: "Записаться",
        },
      ] satisfies StepDefinition[],
    [canSelectLength, needsPhotoStep],
  );

  const normalizedDesiredResult = useMemo(() => {
    const customText = form.desiredResult.trim();

    if (customText) {
      return customText;
    }

    if (!canSelectLength) {
      return selectedService.title;
    }

    return [selectedService.title, lengthLabels[form.length]].join(" - ");
  }, [canSelectLength, form.desiredResult, form.length, selectedService.title]);

  const selectedWindow = availableWindows.find((window) => window.id === form.preferredWindowId) ?? null;
  const windowsByDate = useMemo(() => groupWindowsByDate(availableWindows), [availableWindows]);
  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStep),
  );
  const formatQuestionIndex = Math.max(0, formatQuestionOrder.indexOf(formatQuestion));
  const activeStep = steps[stepIndex] ?? steps[0];
  const contactHandleRequired = form.contactChannel !== "phone";
  const isUploading = uploading.hands || uploading.reference;
  const isBusy = isUploading || isSubmitting;
  const hasTimeSelection = Boolean(selectedWindow);
  const hasPhotoErrors = Boolean(
    fileValidationError.hands ||
      fileValidationError.reference ||
      uploadError.hands ||
      uploadError.reference,
  );
  const isPhotoStepValid = Boolean(
    (!showHandPhoto || form.handPhotos.length > 0) &&
      (!showReference || form.referencePhotos.length > 0) &&
      !hasPhotoErrors,
  );
  const isContactStepValid = Boolean(
    form.clientName.trim() &&
      isPhoneComplete(form.phone) &&
      (!contactHandleRequired || form.contactHandle.trim()),
  );
  const stepValidity: Record<ClientFormStep, boolean> = {
    service: true,
    time: hasTimeSelection,
    photos: isPhotoStepValid,
    contact: isContactStepValid,
  };
  const isReadyToSubmit =
    stepValidity.service &&
    stepValidity.time &&
    (!needsPhotoStep || stepValidity.photos) &&
    stepValidity.contact;
  const progress = `${Math.round(((stepIndex + 1) / steps.length) * 100)}%`;
  const summaryTime = selectedWindow?.label ?? "Не выбрано";
  const summaryContact =
    form.contactChannel === "phone"
      ? form.phone || "Телефон"
      : `${contactLabels[form.contactChannel]} ${form.contactHandle.trim()}`.trim();
  const photosCount = form.handPhotos.length + form.referencePhotos.length;
  const photoStepHint =
    showHandPhoto && showReference
      ? "Нужны фото рук и пример дизайна."
      : showHandPhoto
        ? "Нужно фото рук."
        : showReference
          ? "Нужен референс."
          : "Фото можно пропустить.";
  const handleFieldLabel = form.contactChannel === "telegram" ? "Telegram" : "VK";
  const handleFieldPlaceholder =
    form.contactChannel === "telegram" ? "@username" : "vk.com/username";
  const currentFormatQuestionTitle =
    formatQuestion === "service"
      ? "Какая услуга нужна?"
      : formatQuestion === "length" && canSelectLength
        ? "Какая длина?"
        : formatQuestion === "visit"
          ? "Вы уже были у мастера?"
          : "Есть пожелание?";
  const primaryActionLabel =
    currentStep === "service" ? (formatQuestion === "details" ? activeStep.cta : "Далее") : activeStep.cta;

  const clearFormatAdvanceTimer = () => {
    if (formatAdvanceTimerRef.current === null) {
      return;
    }

    window.clearTimeout(formatAdvanceTimerRef.current);
    formatAdvanceTimerRef.current = null;
  };

  const advanceFormatQuestion = (nextQuestion: ClientFormatQuestion) => {
    clearFormatAdvanceTimer();
    formatAdvanceTimerRef.current = window.setTimeout(() => {
      setFormatQuestion(nextQuestion);
      formatAdvanceTimerRef.current = null;
    }, 220);
  };

  useEffect(() => {
    if (canSelectLength || formatQuestion !== "length") {
      return;
    }

    setFormatQuestion("visit");
  }, [canSelectLength, formatQuestion, setFormatQuestion]);

  useEffect(() => {
    if (!didMountScrollRef.current) {
      didMountScrollRef.current = true;
      return;
    }

    window.requestAnimationFrame(() => {
      const formTop = formRef.current?.getBoundingClientRect().top;
      if (formTop === undefined) {
        return;
      }

      window.scrollTo({
        top: Math.max(0, window.scrollY + formTop - 12),
        behavior: "auto",
      });
    });
  }, [currentStep, formatQuestion]);

  useEffect(() => {
    if (steps.some((step) => step.id === currentStep)) {
      return;
    }

    setCurrentStep(steps[steps.length - 1].id);
  }, [currentStep, steps]);

  useEffect(() => {
    if (availableWindows.length === 0) {
      if (form.preferredWindowId) {
        patchForm({ preferredWindowId: "", customWindowText: "" });
      }
      return;
    }

    if (!availableWindows.some((window) => window.id === form.preferredWindowId)) {
      patchForm({
        preferredWindowId: availableWindows[0].id,
        customWindowText: "",
      });
    }
  }, [availableWindows, form.preferredWindowId]);

  useEffect(() => {
    if (!windowsByDate.length) {
      setSelectedDateKey(null);
      return;
    }

    const selectedWindowDateKey = selectedWindow ? getLocalDateKey(selectedWindow.startAt) : null;

    if (selectedWindowDateKey && selectedWindowDateKey !== selectedDateKey) {
      setSelectedDateKey(selectedWindowDateKey);
      return;
    }

    if (!selectedDateKey || !windowsByDate.some((group) => group.dateKey === selectedDateKey)) {
      setSelectedDateKey(windowsByDate[0].dateKey);
    }
  }, [selectedDateKey, selectedWindow?.id, windowsByDate]);

  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;

    if (!backButton) {
      return;
    }

    const handleBack = () => {
      setCurrentStep((step) => {
        if (step === "service" && formatQuestionIndex > 0) {
          setFormatQuestion(formatQuestionOrder[Math.max(formatQuestionIndex - 1, 0)]);
          return step;
        }

        const index = steps.findIndex((item) => item.id === step);
        return steps[Math.max(index - 1, 0)].id;
      });
    };

    if (stepIndex > 0 || (currentStep === "service" && formatQuestionIndex > 0)) {
      backButton.show();
      backButton.onClick(handleBack);
    } else {
      backButton.hide();
    }

    return () => {
      backButton.offClick(handleBack);
      if (stepIndex > 0 || (currentStep === "service" && formatQuestionIndex > 0)) {
        backButton.hide();
      }
    };
  }, [currentStep, formatQuestionIndex, setCurrentStep, setFormatQuestion, stepIndex, steps]);

  useEffect(
    () => () => {
      clearFormatAdvanceTimer();
    },
    [],
  );

  const handlePhotoFiles = async (kind: PhotoAttachment["kind"], files: File[]) => {
    const key = kind === "hands" ? "hands" : "reference";
    const currentCount = kind === "hands" ? form.handPhotos.length : form.referencePhotos.length;
    const maxCount = kind === "hands" ? maxHandPhotos : maxReferencePhotos;
    const slotsLeft = Math.max(0, maxCount - currentCount);

    if (files.length === 0) {
      return;
    }

    if (slotsLeft === 0) {
      setFileValidationError((current) => ({ ...current, [key]: `Можно добавить до ${maxCount} фото.` }));
      return;
    }

    const acceptedFiles: File[] = [];
    const errors: string[] = [];

    for (const file of files.slice(0, slotsLeft)) {
      if (file.type && !file.type.startsWith("image/")) {
        errors.push(`${file.name}: нужен JPG, PNG или WEBP.`);
        continue;
      }

      if (file.size > maxPhotoSizeBytes) {
        errors.push(`${file.name}: больше 8 МБ.`);
        continue;
      }

      acceptedFiles.push(file);
    }

    if (files.length > slotsLeft) {
      errors.push(`Добавлено только ${slotsLeft}: максимум ${maxCount} фото.`);
    }

    setFileValidationError((current) => ({ ...current, [key]: errors.join(" ") }));

    for (const file of acceptedFiles) {
      await uploadPhoto(kind, file);
    }
  };

  const moveToNextStep = () => {
    if (isSubmitting) {
      return;
    }

    if (currentStep === "service" && formatQuestion !== "details") {
      setFormatQuestion(formatQuestionOrder[Math.min(formatQuestionIndex + 1, formatQuestionOrder.length - 1)]);
      return;
    }

    if (!stepValidity[currentStep]) {
      setShowErrors((current) => ({ ...current, [currentStep]: true }));
      return;
    }

    if (currentStep === steps[steps.length - 1].id) {
      void submitRequest();
      return;
    }

    setCurrentStep(steps[Math.min(stepIndex + 1, steps.length - 1)].id);
  };

  const moveToPreviousStep = () => {
    if (currentStep === "service" && formatQuestionIndex > 0) {
      clearFormatAdvanceTimer();
      setFormatQuestion(formatQuestionOrder[Math.max(formatQuestionIndex - 1, 0)]);
      return;
    }

    setCurrentStep(steps[Math.max(stepIndex - 1, 0)].id);
  };

  return (
    <section className="content-grid">
      <form
        ref={formRef}
        aria-busy={isBusy}
        className="panel request-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="booking-progress-shell">
          <div className="booking-progress-copy">
            <p className="eyebrow">
              Шаг {stepIndex + 1} из {steps.length}
            </p>
            <h2>{activeStep.title}</h2>
          </div>

          <div aria-hidden="true" className="booking-progress-track">
            <span className="booking-progress-fill" style={{ width: progress }} />
          </div>

          <div className="booking-progress-list" aria-label="Прогресс записи">
            {steps.map((step, index) => (
              <div
                aria-current={step.id === currentStep ? "step" : undefined}
                className={`booking-progress-item${index < stepIndex ? " is-complete" : ""}${step.id === currentStep ? " is-active" : ""}`}
                key={step.id}
              >
                <span>{index < stepIndex ? "✓" : index + 1}</span>
                <small>{step.label}</small>
              </div>
            ))}
          </div>
        </div>

        {currentStep === "service" ? (
          <div className="booking-stage">
            <section className="format-question-shell" aria-live="polite">
              <div className="format-question-orbit" aria-hidden="true" />

              <div className="format-question-topline">
                <span>
                  Вопрос {formatQuestionIndex + 1} из {formatQuestionOrder.length}
                </span>
                <div className="format-question-dots" aria-hidden="true">
                  {formatQuestionOrder.map((question, index) => (
                    <span
                      className={`${index < formatQuestionIndex ? "is-complete " : ""}${question === formatQuestion ? "is-active" : ""}`}
                      key={question}
                    />
                  ))}
                </div>
              </div>

              <div className="format-question-card" key={formatQuestion}>
                <div className="format-question-copy">
                  <h3>{currentFormatQuestionTitle}</h3>
                </div>

                {formatQuestion === "service" ? (
                  <div className="service-picker format-service-picker" aria-label="Выбор услуги">
                    {services.map((service) => (
                      <button
                        className={`service-option-card${form.service === service.id ? " active" : ""}`}
                        key={service.id}
                        onClick={() => {
                          patchForm({
                            service: service.id,
                            length: normalizeLengthForService(form.length, service),
                          });
                          advanceFormatQuestion(allowsLengthSelection(service) ? "length" : "visit");
                        }}
                        type="button"
                      >
                        <span>{getServiceModeLabel(service)}</span>
                        <strong>{service.title}</strong>
                        <small>{formatServiceMeta(getServiceDisplayDuration(service), service.priceFrom ?? 0)}</small>
                      </button>
                    ))}
                  </div>
                ) : null}

                {formatQuestion === "length" ? (
                  <div className="booking-pill-group format-answer-grid">
                    {Object.entries(lengthLabels).map(([value, label]) => (
                      <button
                        className={`booking-pill-button booking-pill-button-rich${form.length === value ? " active" : ""}`}
                        key={value}
                        onClick={() => {
                          patchForm({ length: value as FormState["length"] });
                          advanceFormatQuestion("visit");
                        }}
                        type="button"
                      >
                        <strong>{label}</strong>
                        <small>{value === "medium" ? "самый частый выбор" : "выбрать"}</small>
                      </button>
                    ))}
                  </div>
                ) : null}

                {formatQuestion === "visit" ? (
                  <div className="booking-pill-group booking-pill-group-split">
                    {visitChoices.map((choice) => (
                      <button
                        className={`booking-pill-button booking-pill-button-rich${form.isNewClient === choice.value ? " active" : ""}`}
                        key={choice.label}
                        onClick={() => {
                          patchForm({ isNewClient: choice.value });
                          advanceFormatQuestion("details");
                        }}
                        type="button"
                      >
                        <strong>{choice.label}</strong>
                        <small>{choice.hint}</small>
                      </button>
                    ))}
                  </div>
                ) : null}

                {formatQuestion === "details" ? (
                  <div className="format-details-stage">
                    <label className="booking-soft-field">
                      <span>Пожелание, если нужно</span>
                      <textarea
                        value={form.desiredResult}
                        onChange={(event) => patchForm({ desiredResult: event.target.value })}
                        placeholder="Например: мягкий квадрат, молочная база, без дизайна"
                      />
                    </label>

                    <div className="booking-inline-card">
                      <Clock3 size={18} />
                      <div>
                        <strong>{selectedService.title}</strong>
                        <small>
                          {formatServiceMeta(estimatedMinutes, estimatedPriceFrom)} ·{" "}
                          {form.isNewClient ? "первый визит" : "повтор"}
                        </small>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {formatQuestionIndex > 0 ? (
                <button
                  className="ghost-button format-question-back"
                  onClick={moveToPreviousStep}
                  type="button"
                >
                  <ChevronLeft size={16} /> Назад к вопросу
                </button>
              ) : null}
            </section>
          </div>
        ) : null}

        {currentStep === "time" ? (
          <div className="booking-stage">
            <div className="booking-inline-card booking-inline-card-soft">
              <CalendarDays size={18} />
              <div>
                <strong>{selectedService.title}</strong>
                <small>{formatServiceMeta(estimatedMinutes, estimatedPriceFrom)}</small>
              </div>
            </div>

            <div className="booking-calendar" aria-describedby="timeHint">
              <div className="booking-calendar-header">
                <span>Свободные слоты</span>
              </div>

              {windowsByDate.length === 0 ? (
                <div className="empty-state booking-empty-state">
                  Свободных окошек сейчас нет. Мастер скоро добавит новые.
                </div>
              ) : (
                <>
                  <div className="booking-day-pills" role="tablist" aria-label="Дни для записи">
                    {windowsByDate.map((group) => (
                      <button
                        className={`booking-day-pill${selectedDateKey === group.dateKey ? " active" : ""}`}
                        key={group.dateKey}
                        onClick={() => setSelectedDateKey(group.dateKey)}
                        type="button"
                      >
                        <span>{group.label}</span>
                        <small>{group.items.length} слота</small>
                      </button>
                    ))}
                  </div>

                  <div className="booking-date-groups">
                    {windowsByDate
                      .filter((group) => group.dateKey === selectedDateKey)
                      .map((group) => (
                        <section className="booking-date-group" key={group.dateKey}>
                          <strong>{group.label}</strong>
                          <div className="booking-slot-grid">
                            {group.items.map((window) => {
                              const isActive = form.preferredWindowId === window.id;

                              return (
                                <button
                                  className={`booking-slot-button${isActive ? " active" : ""}`}
                                  key={window.id}
                                  onClick={() =>
                                    setForm((current) => ({
                                      ...current,
                                      preferredWindowId: window.id,
                                      customWindowText: "",
                                    }))
                                  }
                                  type="button"
                                >
                                  <span>{formatTimeRange(window.startAt, window.endAt)}</span>
                                  <small>{group.label}</small>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                  </div>
                </>
              )}
            </div>

            {showErrors.time && !hasTimeSelection ? (
              <small className="field-hint" id="timeHint">
                Выберите свободное окошко из списка.
              </small>
            ) : null}

            <div className="booking-selection-note">
              <strong>Сейчас выбрано:</strong> {summaryTime}
            </div>
          </div>
        ) : null}

        {currentStep === "photos" ? (
          <div className="booking-stage">
            <div className="booking-subtitle-row">
              <span>Что приложить</span>
              <small>{photoStepHint}</small>
            </div>

            <div className="booking-upload-grid">
              {showHandPhoto ? (
                <UploadCard
                  caption={`минимум 1 · до ${maxHandPhotos}`}
                  error={
                    (showErrors.photos && form.handPhotos.length === 0 ? "Нужно фото рук." : "") ||
                    fileValidationError.hands ||
                    uploadError.hands
                  }
                  files={form.handPhotos}
                  inputRef={handInputRef}
                  isLoading={uploading.hands}
                  isRequired
                  maxCount={maxHandPhotos}
                  onFilesSelect={(files) => void handlePhotoFiles("hands", files)}
                  onOpenPhoto={setSelectedPhoto}
                  onRemovePhoto={removePhoto}
                  title="Фото рук"
                />
              ) : null}

              {showReference ? (
                <UploadCard
                  caption={`минимум 1 · до ${maxReferencePhotos}`}
                  error={
                    (showErrors.photos && form.referencePhotos.length === 0 ? "Нужен референс." : "") ||
                    fileValidationError.reference ||
                    uploadError.reference
                  }
                  files={form.referencePhotos}
                  inputRef={referenceInputRef}
                  isLoading={uploading.reference}
                  isRequired
                  maxCount={maxReferencePhotos}
                  onFilesSelect={(files) => void handlePhotoFiles("reference", files)}
                  onOpenPhoto={setSelectedPhoto}
                  onRemovePhoto={removePhoto}
                  title="Референс"
                />
              ) : null}
            </div>

            {isUploading ? <small className="field-hint">Загружаю фото...</small> : null}
          </div>
        ) : null}

        {currentStep === "contact" ? (
          <div className="booking-stage">
            <div className="field-row booking-contact-grid">
              <label className="booking-soft-field">
                <span>Как к вам обращаться</span>
                <input
                  aria-invalid={showErrors.contact && !form.clientName.trim()}
                  autoComplete="name"
                  value={form.clientName}
                  onChange={(event) => patchForm({ clientName: event.target.value })}
                  placeholder="Например, Елена"
                />
                {showErrors.contact && !form.clientName.trim() ? (
                  <small className="field-hint">Добавьте имя.</small>
                ) : null}
              </label>

              <label className="booking-soft-field">
                <span>Телефон</span>
                <input
                  aria-invalid={showErrors.contact && !isPhoneComplete(form.phone)}
                  autoComplete="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => patchForm({ phone: normalizePhoneInput(event.target.value) })}
                  placeholder="+7 999 123 45 67"
                />
                {showErrors.contact && !isPhoneComplete(form.phone) ? (
                  <small className="field-hint">Введите телефон полностью.</small>
                ) : null}
              </label>
            </div>

            <section className="booking-choice-section">
              <div className="booking-subtitle-row">
                <span>Куда удобнее ответить</span>
              </div>

              <div className="booking-pill-group booking-pill-group-split">
                {contactChoices.map(({ value, label, icon: Icon }) => (
                  <button
                    className={`booking-contact-choice${form.contactChannel === value ? " active" : ""}`}
                    key={value}
                    onClick={() => patchForm({ contactChannel: value })}
                    type="button"
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </section>

            {contactHandleRequired ? (
              <label className="booking-soft-field">
                <span>{handleFieldLabel}</span>
                <input
                  aria-invalid={showErrors.contact && !form.contactHandle.trim()}
                  autoComplete={form.contactChannel === "telegram" ? "username" : "url"}
                  value={form.contactHandle}
                  onChange={(event) => patchForm({ contactHandle: event.target.value })}
                  placeholder={handleFieldPlaceholder}
                />
                {showErrors.contact && !form.contactHandle.trim() ? (
                  <small className="field-hint">Добавьте {handleFieldLabel.toLowerCase()} для связи.</small>
                ) : null}
              </label>
            ) : null}

            <label className="booking-soft-field">
              <span>Комментарий, если нужно</span>
              <textarea
                value={form.comment}
                onChange={(event) => patchForm({ comment: event.target.value })}
                placeholder="Например: чувствительность, ремонт, пожелание по цвету"
              />
            </label>

            <div className="booking-review-card">
              <div className="booking-subtitle-row">
                <span>Почти готово</span>
              </div>

              <div className="info-grid booking-review-grid">
                <Info icon={<Sparkles size={16} />} label="Услуга" value={selectedService.title} />
                <Info icon={<Clock3 size={16} />} label="Время" value={summaryTime} />
                <Info icon={<UserRound size={16} />} label="Имя" value={form.clientName.trim() || "Не указано"} />
                <Info icon={<Phone size={16} />} label="Контакт" value={summaryContact || "Не указано"} />
                <Info icon={<ImagePlus size={16} />} label="Фото" value={photosCount ? `${photosCount} шт.` : "Без фото"} />
                <Info icon={<Check size={16} />} label="Запрос" value={form.desiredResult.trim() || normalizedDesiredResult} />
              </div>
            </div>
          </div>
        ) : null}

        <div className={`form-navigation${stepIndex === 0 ? " single-action" : ""}`}>
          {stepIndex > 0 ? (
            <button
              className="ghost-button"
              disabled={isBusy}
              onClick={moveToPreviousStep}
              type="button"
            >
              <ChevronLeft size={18} /> Назад
            </button>
          ) : null}

          <button
            className="primary-button"
            disabled={isBusy}
            onClick={() => {
              if (currentStep === "contact" && !isReadyToSubmit) {
                setShowErrors((current) => ({ ...current, contact: true }));
                return;
              }

              moveToNextStep();
            }}
            type="button"
          >
            {currentStep === "contact" ? (
              <>
                {isSubmitting ? "Проверяю окошко..." : "Записаться"} <Send size={18} />
              </>
            ) : (
              <>
                {primaryActionLabel} <Sparkles size={18} />
              </>
            )}
          </button>
        </div>
      </form>

      <aside className="panel summary-panel booking-summary-panel">
        <Sparkles size={28} />
        <h2>{selectedService.title}</h2>
        <div className="summary-badges">
          <span>{canSelectLength ? lengthLabels[form.length] : "своя длина"}</span>
          <span>{form.isNewClient ? "первый визит" : "повтор"}</span>
          <span>{selectedWindow ? "готовый слот" : "без времени"}</span>
        </div>
        <p>
          Примерная длительность: <strong>{formatDuration(estimatedMinutes)}</strong>
        </p>
        <p>
          Примерная стоимость: <strong>от {estimatedPriceFrom.toLocaleString("ru-RU")} ₽</strong>
        </p>
        <div className="summary-story">
          <span>Что делаем</span>
          <strong>{form.desiredResult || normalizedDesiredResult}</strong>
        </div>
        <div className="summary-progress">
          <span>
            Шаг {stepIndex + 1} из {steps.length}
          </span>
          <strong>{activeStep.label}</strong>
        </div>

        <div className="info-grid booking-summary-grid">
          <Info icon={<CalendarDays size={16} />} label="Время" value={summaryTime} />
          <Info icon={<ImagePlus size={16} />} label="Фото" value={photosCount ? `${photosCount} шт.` : "Не добавлены"} />
          <Info icon={<MessageCircle size={16} />} label="Ответ" value={summaryContact || "Не указан"} />
        </div>
      </aside>

      <PhotoLightbox
        photo={selectedPhoto}
        photos={[...form.handPhotos, ...form.referencePhotos]}
        onSelect={setSelectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </section>
  );
}

function UploadCard({
  inputRef,
  title,
  caption,
  files,
  error,
  isLoading,
  isRequired,
  maxCount,
  onFilesSelect,
  onOpenPhoto,
  onRemovePhoto,
}: UploadCardProps) {
  const canAddMore = files.length < maxCount;

  return (
    <div className={`booking-upload-card${files.length ? " is-filled" : ""}${error ? " is-invalid" : ""}${!isRequired ? " is-optional" : ""}`}>
      <input
        accept="image/jpeg,image/png,image/webp"
        className="booking-upload-input"
        multiple
        ref={inputRef}
        type="file"
        onChange={(event) => {
          onFilesSelect(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />

      <button
        className="booking-upload-card-trigger"
        disabled={isLoading || !canAddMore}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <span className="booking-upload-icon">
          {files.length ? <Check size={18} /> : <ImagePlus size={18} />}
        </span>

        <span className="booking-upload-copy">
          <strong>{title}</strong>
          <small>{caption}</small>
          <em>
            {isLoading
              ? "Загружаю..."
              : files.length
                ? `${files.length} из ${maxCount} добавлено`
                : isRequired
                  ? "Добавить фото"
                  : "Можно пропустить"}
          </em>
        </span>
      </button>

      {files.length ? (
        <PhotoGallery photos={files} onOpen={onOpenPhoto} onRemove={onRemovePhoto} />
      ) : null}
      {error ? <small className="field-hint">{error}</small> : null}
    </div>
  );
}

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function formatServiceMeta(durationMinutes: number, priceFrom: number) {
  return `${formatDuration(durationMinutes)} · от ${priceFrom.toLocaleString("ru-RU")} ₽`;
}

function getServiceDisplayDuration(service: ServicePreset) {
  return service.durationMinutes + (allowsLengthSelection(service) ? 45 : 0);
}

function getServiceModeLabel(service: ServicePreset) {
  if (!allowsLengthSelection(service)) {
    return "своя длина";
  }

  if (service.requiresReference) {
    return "можно всё";
  }

  return "быстрый уход";
}
