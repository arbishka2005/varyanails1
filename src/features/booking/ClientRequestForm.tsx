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
import {
  contactLabels,
  formatTimeRange,
  groupWindowsByDate,
  lengthLabels,
  photoKindLabel,
} from "../../lib/bookingPresentation";
import { getTelegramWebApp } from "../../app/navigation";
import { isPhoneComplete, normalizePhoneInput } from "../../lib/phone";
import {
  customWindowValue,
  type ClientFormatQuestion,
  type ClientFormStep,
  type FormState,
} from "./formState";
import type { ContactChannel, PhotoAttachment, ServicePreset, TimeWindow } from "../../types";

type StepDefinition = {
  id: ClientFormStep;
  label: string;
  title: string;
  description: string;
  cta: string;
};

type UploadCardProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  title: string;
  caption: string;
  file: PhotoAttachment | null;
  error: string;
  isLoading: boolean;
  isRequired: boolean;
  onFileSelect: (file?: File) => void;
};

const customTimeSuggestions = ["После 18:00 в будни", "Утром в будни", "В выходные"] as const;
const formatQuestionOrder: ClientFormatQuestion[] = ["service", "length", "visit", "details"];

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
  requiresHandPhoto,
  requiresReference,
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
  uploading,
  uploadError,
}: {
  form: FormState;
  estimatedMinutes: number;
  estimatedPriceFrom: number;
  requiresHandPhoto: boolean;
  requiresReference: boolean;
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
  uploading: { hands: boolean; reference: boolean };
  uploadError: { hands: string; reference: string };
}) {
  const maxPhotoSizeBytes = 8 * 1024 * 1024;
  const handInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const formatAdvanceTimerRef = useRef<number | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
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

  const needsPhotoStep = requiresHandPhoto || requiresReference;
  const steps = useMemo(
    () =>
      [
        {
          id: "service",
          label: "Формат",
          title: "Что делаем?",
          description: "Выберите услугу и длину. Остальное подстроим дальше.",
          cta: "Выбрать время",
        },
        {
          id: "time",
          label: "Время",
          title: "Когда удобно?",
          description: "Нужен один слот или свой вариант времени.",
          cta: needsPhotoStep ? "Дальше" : "Контакты",
        },
        ...(needsPhotoStep
          ? ([
              {
                id: "photos",
                label: "Фото",
                title: "Добавьте фото",
                description: "Так мастер быстрее поймёт задачу и ответит точнее.",
                cta: "Контакты",
              },
            ] satisfies StepDefinition[])
          : []),
        {
          id: "contact",
          label: "Контакт",
          title: "Куда ответить?",
          description: "Оставьте короткий контакт и отправляйте заявку.",
          cta: "Отправить заявку",
        },
      ] satisfies StepDefinition[],
    [needsPhotoStep],
  );

  const normalizedDesiredResult = useMemo(() => {
    const customText = form.desiredResult.trim();

    if (customText) {
      return customText;
    }

    return [selectedService.title, lengthLabels[form.length]].join(" - ");
  }, [form.desiredResult, form.length, selectedService.title]);

  const selectedWindow = availableWindows.find((window) => window.id === form.preferredWindowId) ?? null;
  const needsCustomWindow = form.preferredWindowId === customWindowValue;
  const windowsByDate = useMemo(() => groupWindowsByDate(availableWindows), [availableWindows]);
  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStep),
  );
  const formatQuestionIndex = Math.max(0, formatQuestionOrder.indexOf(formatQuestion));
  const activeStep = steps[stepIndex] ?? steps[0];
  const contactHandleRequired = form.contactChannel !== "phone";
  const isUploading = uploading.hands || uploading.reference;
  const hasTimeSelection = needsCustomWindow ? Boolean(form.customWindowText.trim()) : Boolean(selectedWindow);
  const hasPhotoErrors = Boolean(
    fileValidationError.hands ||
      fileValidationError.reference ||
      uploadError.hands ||
      uploadError.reference,
  );
  const isPhotoStepValid = Boolean(
    (!requiresHandPhoto || form.handPhoto) &&
      (!requiresReference || form.referencePhoto) &&
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
  const summaryTime = needsCustomWindow
    ? form.customWindowText.trim() || "Свой вариант"
    : selectedWindow?.label ?? "Не выбрано";
  const summaryContact =
    form.contactChannel === "phone"
      ? form.phone || "Телефон"
      : `${contactLabels[form.contactChannel]} ${form.contactHandle.trim()}`.trim();
  const photosCount = Number(Boolean(form.handPhoto)) + Number(Boolean(form.referencePhoto));
  const photoStepHint =
    requiresHandPhoto && requiresReference
      ? "Нужны фото рук и пример дизайна."
      : requiresHandPhoto
        ? "Нужно фото рук."
        : requiresReference
          ? "Нужен референс."
          : "Фото можно пропустить.";
  const handleFieldLabel = form.contactChannel === "telegram" ? "Telegram" : "VK";
  const handleFieldPlaceholder =
    form.contactChannel === "telegram" ? "@username" : "vk.com/username";
  const currentFormatQuestionTitle =
    formatQuestion === "service"
      ? "Какая услуга нужна?"
      : formatQuestion === "length"
        ? "Какая длина?"
        : formatQuestion === "visit"
          ? "Вы уже были у мастера?"
          : "Есть пожелание?";
  const currentFormatQuestionHint =
    formatQuestion === "service"
      ? "Нажмите на подходящий вариант."
      : formatQuestion === "length"
        ? "По умолчанию стоит средняя."
        : formatQuestion === "visit"
          ? "От этого зависит, нужны ли фото рук."
          : "Можно пропустить и сразу выбрать время.";
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
    if (steps.some((step) => step.id === currentStep)) {
      return;
    }

    setCurrentStep(steps[steps.length - 1].id);
  }, [currentStep, steps]);

  useEffect(() => {
    if (availableWindows.length === 0) {
      if (form.preferredWindowId !== customWindowValue) {
        patchForm({ preferredWindowId: customWindowValue });
      }
      return;
    }

    if (form.preferredWindowId === customWindowValue) {
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

    const selectedWindowDateKey = selectedWindow?.startAt.split("T")[0];

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

  const handlePhotoChange = (kind: PhotoAttachment["kind"], file?: File) => {
    const key = kind === "hands" ? "hands" : "reference";

    if (!file) {
      return;
    }

    if (file.type && !file.type.startsWith("image/")) {
      setFileValidationError((current) => ({ ...current, [key]: "Загрузите изображение: JPG, PNG или HEIC." }));
      return;
    }

    if (file.size > maxPhotoSizeBytes) {
      setFileValidationError((current) => ({ ...current, [key]: "Фото тяжелее 8 МБ. Выберите файл поменьше." }));
      return;
    }

    setFileValidationError((current) => ({ ...current, [key]: "" }));
    void uploadPhoto(kind, file);
  };

  const moveToNextStep = () => {
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
        aria-busy={isUploading}
        className="panel request-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="booking-progress-shell">
          <div className="booking-progress-copy">
            <p className="eyebrow">
              Шаг {stepIndex + 1} из {steps.length}
            </p>
            <h2>{activeStep.title}</h2>
            <p>{activeStep.description}</p>
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
                <span>{index + 1}</span>
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
                  <p>{currentFormatQuestionHint}</p>
                </div>

                {formatQuestion === "service" ? (
                  <div className="service-picker format-service-picker" aria-label="Выбор услуги">
                    {services.map((service) => (
                      <button
                        className={`service-option-card${form.service === service.id ? " active" : ""}`}
                        key={service.id}
                        onClick={() => {
                          patchForm({ service: service.id });
                          advanceFormatQuestion("length");
                        }}
                        type="button"
                      >
                        <span>{getServiceModeLabel(service)}</span>
                        <strong>{service.title}</strong>
                        <small>{formatServiceMeta(service.durationMinutes, service.priceFrom ?? 0)}</small>
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
                  className="format-question-back"
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
                  Свободных слотов сейчас нет. Оставьте свой вариант времени ниже.
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
                                    setForm({
                                      ...form,
                                      preferredWindowId: window.id,
                                      customWindowText: "",
                                    })
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

            <section className="booking-choice-section">
              <div className="booking-subtitle-row">
                <span>Не подходит?</span>
                <small>Можно сразу оставить свой вариант</small>
              </div>

              <button
                className={`calendar-custom-button${needsCustomWindow ? " active" : ""}`}
                onClick={() =>
                  setForm({
                    ...form,
                    preferredWindowId: customWindowValue,
                  })
                }
                type="button"
              >
                Нужен другой день или час
              </button>

              {needsCustomWindow ? (
                <div className="booking-stage-stack">
                  <div className="booking-pill-group booking-pill-group-wrap">
                    {customTimeSuggestions.map((suggestion) => (
                      <button
                        className={`booking-pill-button booking-pill-button-soft${form.customWindowText === suggestion ? " active" : ""}`}
                        key={suggestion}
                        onClick={() => patchForm({ customWindowText: suggestion })}
                        type="button"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <label className="booking-soft-field">
                    <span>Свой вариант</span>
                    <input
                      aria-invalid={showErrors.time && !hasTimeSelection}
                      value={form.customWindowText}
                      onChange={(event) => patchForm({ customWindowText: event.target.value })}
                      placeholder="Например: после 18:00 в будни"
                    />
                  </label>
                </div>
              ) : null}

              {showErrors.time && !hasTimeSelection ? (
                <small className="field-hint" id="timeHint">
                  Выберите слот или напишите свой вариант времени.
                </small>
              ) : null}
            </section>

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
              <UploadCard
                caption={requiresHandPhoto ? "обязательно" : "по желанию"}
                error={
                  (showErrors.photos && requiresHandPhoto && !form.handPhoto ? "Нужно фото рук." : "") ||
                  fileValidationError.hands ||
                  uploadError.hands
                }
                file={form.handPhoto}
                inputRef={handInputRef}
                isLoading={uploading.hands}
                isRequired={requiresHandPhoto}
                onFileSelect={(file) => handlePhotoChange("hands", file)}
                title={requiresHandPhoto ? "Фото рук" : "Фото рук, если есть нюансы"}
              />

              <UploadCard
                caption={requiresReference ? "обязательно" : "по желанию"}
                error={
                  (showErrors.photos && requiresReference && !form.referencePhoto ? "Нужен референс." : "") ||
                  fileValidationError.reference ||
                  uploadError.reference
                }
                file={form.referencePhoto}
                inputRef={referenceInputRef}
                isLoading={uploading.reference}
                isRequired={requiresReference}
                onFileSelect={(file) => handlePhotoChange("reference", file)}
                title={requiresReference ? "Референс" : "Референс, если нужен дизайн"}
              />
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
                <small>Оставьте один основной канал</small>
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
                <small>Проверять отдельным экраном уже не нужно</small>
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
              className="secondary-button"
              disabled={isUploading}
              onClick={moveToPreviousStep}
              type="button"
            >
              <ChevronLeft size={18} /> Назад
            </button>
          ) : null}

          <button
            className="primary-button"
            disabled={isUploading}
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
                Отправить заявку <Send size={18} />
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
          <span>{lengthLabels[form.length]}</span>
          <span>{form.isNewClient ? "первый визит" : "повтор"}</span>
          <span>{needsCustomWindow ? "свой вариант" : "готовый слот"}</span>
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
    </section>
  );
}

function UploadCard({
  inputRef,
  title,
  caption,
  file,
  error,
  isLoading,
  isRequired,
  onFileSelect,
}: UploadCardProps) {
  return (
    <div className={`booking-upload-card${file ? " is-filled" : ""}${error ? " is-invalid" : ""}${!isRequired ? " is-optional" : ""}`}>
      <input
        accept="image/*"
        className="booking-upload-input"
        ref={inputRef}
        type="file"
        onChange={(event) => onFileSelect(event.target.files?.[0])}
      />

      <button
        className="booking-upload-card-trigger"
        disabled={isLoading}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <span className="booking-upload-icon">
          {file ? <Check size={18} /> : <ImagePlus size={18} />}
        </span>

        <span className="booking-upload-copy">
          <strong>{title}</strong>
          <small>{caption}</small>
          <em>
            {isLoading ? "Загружаю..." : file ? file.fileName : isRequired ? "Добавить фото" : "Можно пропустить"}
          </em>
        </span>
      </button>

      {file ? <span className="success-text booking-upload-status">{photoKindLabel(file.kind)} добавлено</span> : null}
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

function getServiceModeLabel(service: ServicePreset) {
  if (service.requiresReference) {
    return "с дизайном / референсом";
  }

  return "быстрый уход";
}
