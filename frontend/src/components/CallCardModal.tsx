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
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // Which tel: link was actually tapped — defaults to the main number, but
  // switches if the manager calls one of the "Доп. номера" links instead.
  const [calledPhone, setCalledPhone] = useState<string | null>(null);
  // Auto-lookups triggered off the new contact's "ИНН ЮЛ"/"Адрес" fields —
  // null just means "nothing found yet / no source data", distinguished
  // from "still searching" by the *Loading flags below.
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgManagerName, setOrgManagerName] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [sfrAddress, setSfrAddress] = useState<string | null>(null);
  const [sfrLoading, setSfrLoading] = useState(false);

  function lookupOrg(inn: string) {
    setOrgLoading(true);
    api
      .post<{ name: string | null; managerName: string | null }>("/contacts/lookup-org", { inn })
      .then((res) => {
        setOrgName(res.name);
        setOrgManagerName(res.managerName);
      })
      .catch(() => {
        setOrgName(null);
        setOrgManagerName(null);
      })
      .finally(() => setOrgLoading(false));
  }

  function lookupSfr(address: string) {
    setSfrLoading(true);
    api
      .get<{ address: string | null }>(`/social-fund-offices/lookup?address=${encodeURIComponent(address)}`)
      .then((res) => setSfrAddress(res.address))
      .catch(() => setSfrAddress(null))
      .finally(() => setSfrLoading(false));
  }

  function loadNext() {
    setLoading(true);
    setError(null);
    setDep("");
    setDescription("");
    setOrgName(null);
    setOrgManagerName(null);
    setOrgLoading(false);
    setSfrAddress(null);
    setSfrLoading(false);
    api
      .post<{ contact: Contact | null }>("/contacts/claim-next")
      .then((res) => {
        setContact(res.contact);
        setCalledPhone(res.contact?.phone ?? null);
        if (res.contact) {
          const { inn, address } = parseExtraInfo(res.contact.extraInfo);
          if (inn) lookupOrg(inn);
          if (address) lookupSfr(address);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось получить контакт"))
      .finally(() => setLoading(false));
  }

  useEffect(loadNext, []);

  async function handleToTrubki() {
    if (!contact) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/contacts/${contact.id}/convert`, {
        dep: dep.trim() || undefined,
        phone: calledPhone || contact.phone,
        description: description.trim() || undefined,
        orgName: orgName ?? undefined,
        managerName: orgManagerName ?? undefined,
      });
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

  const { birthDate, extraPhones, inn, address, rest } = parseExtraInfo(contact?.extraInfo);
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
              <a
                className="call-icon"
                href={`tel:${contact.phone}`}
                title="Позвонить"
                aria-label="Позвонить"
                onClick={() => setCalledPhone(contact.phone)}
              >
                <IconPhone />
              </a>
            </div>
            {extraPhones.length > 0 && (
              <div className="call-card-extra-phones">
                {extraPhones.map((p) => (
                  <a key={p} href={`tel:${p}`} onClick={() => setCalledPhone(p)}>
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
                  {rest.length === 0 && !inn && !address ? (
                    <span className="muted">—</span>
                  ) : (
                    <>
                      {address && (
                        <div>
                          <strong>Адрес: </strong>
                          {address}
                        </div>
                      )}
                      {address && (
                        <div>
                          <strong>Соц. фонд (СФР): </strong>
                          {sfrLoading ? "Поиск..." : sfrAddress || "Не найден"}
                        </div>
                      )}
                      {inn && (
                        <div>
                          <strong>ИНН ЮЛ: </strong>
                          {inn}
                          {orgLoading ? " (поиск...)" : orgName ? ` — ${orgName}` : " (не найдено)"}
                        </div>
                      )}
                      {inn && !orgLoading && orgManagerName && (
                        <div>
                          <strong>Руководитель: </strong>
                          {orgManagerName}
                        </div>
                      )}
                      {rest.map((f, i) => (
                        <div key={i}>
                          {f.label && <strong>{f.label}: </strong>}
                          {f.value}
                        </div>
                      ))}
                    </>
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

              <label className="span-2">
                Описание
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Описание"
                  disabled={submitting}
                  rows={3}
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
