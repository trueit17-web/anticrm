import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { Contact, ContactStatus } from "../types";
import { detectMobileOperator } from "../lib/mobileOperator";
import { fullNameIncludesBirthDate, parseExtraInfo } from "../lib/contactExtraInfo";
import { IconPhone, IconX } from "./icons";

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
  // "код в:" — persisted onto the created trubka's reportedTime ("Время кода").
  const [codeIn, setCodeIn] = useState("");
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

  // Bumped on every loadNext() call — org/SFR lookups (and the claim-next
  // response itself) check their own captured generation against this
  // before applying anything, so a slow response for the *previous*
  // contact can't land on top of whatever's on screen now. Without this,
  // switching contacts quickly (e.g. "Отпустить" right after opening) could
  // let contact A's lookup resolve after contact B is already showing and
  // silently overwrite B's org/address fields with A's data.
  const requestGeneration = useRef(0);
  const abortControllers = useRef<AbortController[]>([]);

  function lookupOrg(inn: string, generation: number) {
    setOrgLoading(true);
    const controller = new AbortController();
    abortControllers.current.push(controller);
    api
      .post<{ name: string | null; managerName: string | null }>(
        "/contacts/lookup-org",
        { inn },
        { signal: controller.signal }
      )
      .then((res) => {
        if (generation !== requestGeneration.current) return;
        setOrgName(res.name);
        setOrgManagerName(res.managerName);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (generation !== requestGeneration.current) return;
        setOrgName(null);
        setOrgManagerName(null);
      })
      .finally(() => {
        if (generation === requestGeneration.current) setOrgLoading(false);
      });
  }

  function lookupSfr(address: string, region: string | null, generation: number) {
    setSfrLoading(true);
    const controller = new AbortController();
    abortControllers.current.push(controller);
    const regionParam = region ? `&region=${encodeURIComponent(region)}` : "";
    api
      .get<{ address: string | null }>(
        `/contacts/social-fund-offices/lookup?address=${encodeURIComponent(address)}${regionParam}`,
        { signal: controller.signal }
      )
      .then((res) => {
        if (generation !== requestGeneration.current) return;
        setSfrAddress(res.address);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (generation !== requestGeneration.current) return;
        setSfrAddress(null);
      })
      .finally(() => {
        if (generation === requestGeneration.current) setSfrLoading(false);
      });
  }

  function loadNext() {
    const generation = ++requestGeneration.current;
    // Anything still in flight for the previous contact is now stale —
    // stop it outright rather than just ignoring its result.
    for (const controller of abortControllers.current) controller.abort();
    abortControllers.current = [];

    setLoading(true);
    setError(null);
    setDep("");
    setCodeIn("");
    setDescription("");
    setOrgName(null);
    setOrgManagerName(null);
    setOrgLoading(false);
    setSfrAddress(null);
    setSfrLoading(false);
    api
      .post<{ contact: Contact | null }>("/contacts/claim-next")
      .then((res) => {
        if (generation !== requestGeneration.current) return;
        setContact(res.contact);
        setCalledPhone(res.contact?.phone ?? null);
        if (res.contact) {
          const { inn, address, region } = parseExtraInfo(res.contact.extraInfo);
          if (inn) lookupOrg(inn, generation);
          if (address || region) lookupSfr(address ?? "", region, generation);
        }
      })
      .catch((err) => {
        if (generation !== requestGeneration.current) return;
        setError(err instanceof ApiError ? err.message : "Не удалось получить контакт");
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
  }

  useEffect(() => {
    loadNext();
    return () => {
      // Unmounting (card closed) — stop treating any in-flight response as
      // current so it can't call setState after the component is gone.
      requestGeneration.current++;
      for (const controller of abortControllers.current) controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToTrubki() {
    if (!contact) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/contacts/${contact.id}/convert`, {
        dep: dep.trim() || undefined,
        reportedTime: codeIn.trim() || undefined,
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

  // НДЗ / АО / Недожал / Скип на коде — records the disposition and moves on
  // to the next queued contact. Each is a distinct status counted separately
  // in the Прозвон statistics.
  async function handleOutcome(status: ContactStatus) {
    if (!contact) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/contacts/${contact.id}/outcome`, { status });
      loadNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить результат");
    } finally {
      setSubmitting(false);
    }
  }

  // The ✕ in the corner closes the card and, if a contact is on screen,
  // returns it to the shared queue (the former "Отпустить" action) so it
  // isn't left claimed under this manager indefinitely. Closing still works
  // even if the release call fails — the contact just stays claimed and
  // resurfaces on reopen, same as before.
  async function handleCloseWithRelease() {
    if (contact) {
      try {
        await api.post(`/contacts/${contact.id}/release`);
      } catch {
        // Ignore — closing is the primary intent; a still-claimed contact
        // reappears next time the card is opened.
      }
    }
    onClose();
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
        <button
          type="button"
          className="call-card-close"
          onClick={handleCloseWithRelease}
          disabled={submitting}
          title="Закрыть и отпустить контакт в очередь"
          aria-label="Закрыть"
        >
          <IconX width={18} height={18} />
        </button>
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

              <label className="no-caption">
                <input
                  value={dep}
                  onChange={(e) => setDep(e.target.value)}
                  placeholder="Деп."
                  disabled={submitting}
                />
              </label>

              <label className="no-caption">
                <input
                  value={codeIn}
                  onChange={(e) => setCodeIn(e.target.value)}
                  placeholder="код в:"
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

            <div className="modal-actions call-card-actions">
              <div className="call-card-outcomes">
                <button type="button" className="secondary" onClick={() => handleOutcome("NOT_REACHED")} disabled={submitting}>
                  НДЗ
                </button>
                <button type="button" className="secondary" onClick={() => handleOutcome("ANSWERING_MACHINE")} disabled={submitting}>
                  АО
                </button>
                <button type="button" className="secondary" onClick={() => handleOutcome("NOT_PUSHED")} disabled={submitting}>
                  Недожал
                </button>
                <button type="button" className="secondary" onClick={() => handleOutcome("SKIP_ON_CODE")} disabled={submitting}>
                  Скип на коде
                </button>
              </div>
              <button type="button" className="btn-save call-card-transfer" onClick={handleToTrubki} disabled={submitting}>
                {submitting ? "..." : "Передать"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
