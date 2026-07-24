import { FormEvent, useEffect, useState } from "react";
import { Appeal, HistoryEntry } from "../types";
import { api, ApiError } from "../api/client";
import { parseExtraInfo } from "../lib/contactExtraInfo";
import { IconCheck, IconX } from "./icons";

export interface AppealFormValues {
  date: string;
  phone: string;
  clientData: string;
  dep: string;
  reportedTime: string;
  description: string;
}

function toDateInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().slice(0, 10);
}

function formatChangedAt(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryList({ appealId }: { appealId: number }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ history: HistoryEntry[] }>(`/appeals/${appealId}/history`)
      .then((res) => setHistory(res.history))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить историю"))
      .finally(() => setLoading(false));
  }, [appealId]);

  return (
    <div className="history-section">
      <h3>История изменений</h3>
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && history.length === 0 && (
        <p className="muted">Изменений пока не было.</p>
      )}
      {!loading && !error && history.length > 0 && (
        <ul className="history-list">
          {history.map((h) => (
            <li key={h.id}>
              <span className="muted">{formatChangedAt(h.changedAt)}</span> — <b>{h.changedBy.fullName}</b>
              {": "}
              {h.fieldLabel}: «{h.oldValue ?? "—"}» → «{h.newValue ?? "—"}»
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Shown read-only when this appeal came from "В трубки" on a Прозвон call
// card — clientData only ever got the trimmed ФИО/ДР, so this is the only
// place the rest of the originally uploaded data (region, доп. номера,
// ИНН, address, etc.) is still visible once the contact record's own
// queue entry is done.
function ContactExtraInfo({ extraInfo }: { extraInfo: string }) {
  const { birthDate, extraPhones, inn, address, rest } = parseExtraInfo(extraInfo);

  return (
    <label className="span-2">
      Доп. инфа из базы прозвона
      <div className="call-card-extra-info">
        {birthDate && (
          <div>
            <strong>Дата рождения: </strong>
            {birthDate}
          </div>
        )}
        {extraPhones.length > 0 && (
          <div>
            <strong>Доп. номера: </strong>
            {extraPhones.join(", ")}
          </div>
        )}
        {address && (
          <div>
            <strong>Адрес: </strong>
            {address}
          </div>
        )}
        {inn && (
          <div>
            <strong>ИНН ЮЛ: </strong>
            {inn}
          </div>
        )}
        {rest.map((f, i) => (
          <div key={i}>
            {f.label && <strong>{f.label}: </strong>}
            {f.value}
          </div>
        ))}
      </div>
    </label>
  );
}

export function AppealFormModal({
  appeal,
  onClose,
  onSubmit,
}: {
  appeal: Appeal | null;
  onClose: () => void;
  onSubmit: (values: AppealFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<AppealFormValues>({
    date: toDateInputValue(appeal?.date),
    phone: appeal?.phone ?? "",
    clientData: appeal?.clientData ?? "",
    dep: appeal?.dep ?? "",
    reportedTime: appeal?.reportedTime ?? "",
    description: appeal?.description ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h2>{appeal ? "Редактировать трубку" : "Новая трубка"}</h2>

          <div className="form-grid">
            <label>
              Дата
              <input
                type="date"
                value={values.date}
                onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
                required
              />
            </label>

            <label>
              Телефон
              <input
                value={values.phone}
                onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                required
              />
            </label>

            <label>
              Время кода
              <input
                placeholder="напр. 14:35"
                value={values.reportedTime}
                onChange={(e) => setValues((v) => ({ ...v, reportedTime: e.target.value }))}
              />
            </label>

            <label className="span-2">
              Данные клиента
              <textarea
                value={values.clientData}
                onChange={(e) => setValues((v) => ({ ...v, clientData: e.target.value }))}
                rows={2}
              />
            </label>

            <label className="span-2">
              Деп.
              <span className="money-field">
                <input
                  value={values.dep}
                  onChange={(e) => setValues((v) => ({ ...v, dep: e.target.value }))}
                />
                <span className="money-suffix">₽</span>
              </span>
            </label>

            <label className="span-2">
              Описание
              <textarea
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                rows={3}
              />
            </label>

            {appeal?.contact?.extraInfo && <ContactExtraInfo extraInfo={appeal.contact.extraInfo} />}
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              <IconX width={15} height={15} />
              Отмена
            </button>
            <button type="submit" className="btn-save" disabled={submitting}>
              <IconCheck width={15} height={15} />
              {submitting ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </form>

        {appeal && <HistoryList appealId={appeal.id} />}
      </div>
    </div>
  );
}
