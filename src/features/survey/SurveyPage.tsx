import { useEffect, useState } from "react";
import { api, getApiErrorMessage } from "../../api";
import { formatDateTime } from "../../lib/bookingPresentation";
import type { Appointment } from "../../types";

export function SurveyPage({ appointmentToken }: { appointmentToken: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "submitted" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setErrorMessage("");
    api
      .getPublicAppointment(appointmentToken)
      .then((data) => {
        if (!mounted) {
          return;
        }
        setAppointment(data);
        if (data.surveyRating) {
          setStatus("submitted");
          setRating(data.surveyRating);
          setText(data.surveyText ?? "");
        } else {
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setErrorMessage(getApiErrorMessage(error, "Не удалось открыть форму."));
          setStatus("error");
        }
      });
    return () => {
      mounted = false;
    };
  }, [appointmentToken]);

  const submitSurvey = async () => {
    if (!rating || isSubmitting) {
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage("");
      await api.submitAppointmentSurvey(appointmentToken, {
        rating,
        text: text.trim() ? text.trim() : undefined,
      });
      setStatus("submitted");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Не удалось отправить отзыв."));
      setStatus("ready");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="survey-layout">
      <div className={`panel survey-panel is-${status}`}>
        <h2>Оцените визит</h2>
        {status === "loading" ? <p role="status">Загружаю данные записи...</p> : null}
        {status === "error" ? (
          <p role="alert">{errorMessage || "Не удалось открыть форму. Попробуйте позже или напишите мастеру."}</p>
        ) : null}
        {status !== "loading" && status !== "error" && appointment ? (
          <>
            <p>Запись: {formatDateTime(appointment.startAt)}</p>
            {errorMessage ? <p role="alert">{errorMessage}</p> : null}
            {status === "submitted" ? (
              <p role="status">Спасибо! Отзыв уже получен.</p>
            ) : (
              <>
                <div className="rating-row">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      className={`rating-button${rating === value ? " active" : ""}`}
                      onClick={() => setRating(value)}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <label>
                  Отзыв
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Напишите пару слов о визите"
                  />
                </label>
                <button className="primary-button" disabled={!rating || isSubmitting} onClick={submitSurvey} type="button">
                  {isSubmitting ? "Отправляю..." : "Отправить отзыв"}
                </button>
              </>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
