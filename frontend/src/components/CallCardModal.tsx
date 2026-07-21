import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Contact } from "../types";
import { detectMobileOperator } from "../lib/mobileOperator";
import { fullNameIncludesBirthDate, parseExtraInfo } from "../lib/contactExtraInfo";
import { IconPhone } from "./icons";

// "Звонить!" — grabs the next contact off the shared queue and shows it as
// a single-contact card instead of sending the manager to the queue list.
// After either status button, it grabs the next contact automatically so
// the manager can keep working the queue without reopening the card.
//
// Only the "Закрыть" button actually closes it (calls onClose, unmounting
// the card). Clicking the overlay instead just minimizes it to a small tab
// on the right edge — the manager's place in the queue isn't lost by an
// accidental click elsewhere.
export function CallCardModal({ onClose }: { onClose: () => void }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dep, setDep] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [minimized, setMinimized] = useState(false);

  function loadNext() {
    setLoading(true);
    setError(null);
    setDep("");
    api
      .post<{ contact: Contact | null }>("/contacts/claim-next")
      .then((res) => setContact(res.contact))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось получить контакт"))
      .finally(() => setLoading(false));
  }

  useEffect(loadNext, []);

  async function handleToTrubki() {
    if (!contact) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/contacts/${contact.id}/convert`, { dep: dep.trim() || undefined });
      loadNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать трубку");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNotReached() {
    if (!contact) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/contacts/${contact.id}/outcome`, { status: "NOT_REACHED" });
      loadNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить результат");
    } finally {
      setSubmitting(false);
    }
  }

  if (minimized) {
    return (
      <button type="button" className="call-card-tab" onClick={() => setMinimized(false)}>
        <IconPhone width={16} height={16} />
        Звонок
      </button>
    );
  }

  const { birthDate, extraPhones, rest } = parseExtraInfo(contact?.extraInfo);
  const showBirthDateSeparately = birthDate && !fullNameIncludesBirthDate(contact?.fullName, birthDate);
  const title = contact
    ? [contact.fullName || "Без имени", showBirthDateSeparately ? birthDate : null].filter(Boolean).join(", ")
    : "Звонок";

  return (
    <div className="modal-overlay" onClick={() => setMinimized(true)}>
      <div className="modal-card call-card" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {loading && <p className="muted">Ищем контакт...</p>}
        {!loading && error && !contact && <p className="error-text">{error}</p>}
        {!loading && !error && !contact && <p className="empty-state">Очередь пуста.</p>}

        {contact && (
          <>
            <div className="call-card-phone">
              <span className="call-card-phone-value">{contact.phone}</span>
              <a className="call-icon" href={`tel:${contact.phone}`} title="Позвонить" aria-label="Позвонить">
                <IconPhone />
              </a>
            </div>
            {extraPhones.length > 0 && (
              <div className="call-card-extra-phones">
                {extraPhones.map((p) => (
                  <a key={p} href={`tel:${p}`}>
                    {p}
                  </a>
                ))}
              </div>
            )}
            <p className="muted call-card-operator">{detectMobileOperator(contact.phone)}</p>

            <div className="form-grid">
              <label className="span-2">
                Доп. инфа
                <div className="call-card-extra-info">
                  {rest.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    rest.map((f, i) => (
                      <div key={i}>
                        {f.label && <strong>{f.label}: </strong>}
                        {f.value}
                      </div>
                    ))
                  )}
                </div>
              </label>

              <label className="span-2">
                Деп.
                <input
                  value={dep}
                  onChange={(e) => setDep(e.target.value)}
                  placeholder="Деп."
                  disabled={submitting}
                />
              </label>
            </div>

            {error && <p className="error-text">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
                Закрыть
              </button>
              <button type="button" className="secondary" onClick={handleNotReached} disabled={submitting}>
                {submitting ? "..." : "НДЗ"}
              </button>
              <button type="button" onClick={handleToTrubki} disabled={submitting}>
                {submitting ? "..." : "В трубки"}
              </button>
            </div>
          </>
        )}

        {!loading && !contact && (
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
