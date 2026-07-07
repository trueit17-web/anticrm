import { FormEvent, useState } from "react";
import { Appeal, AppealStatus, INTAKE_LABELS, IntakeChannel, STATUS_LABELS, UserSummary } from "../types";
import { canEditAssignments } from "../lib/permissions";
import { useAuth } from "../auth/AuthContext";

export interface AppealFormValues {
  date: string;
  phone: string;
  intake: IntakeChannel;
  clientData: string;
  status: AppealStatus;
  description: string;
  govAssigneeId: number | null;
  cbAssigneeId: number | null;
  fsbAssigneeId: number | null;
  closerAssigneeId: number | null;
}

function toDateInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().slice(0, 10);
}

function assigneeToOption(id: number | null | undefined): number | null {
  return id ?? null;
}

export function AppealFormModal({
  appeal,
  staff,
  onClose,
  onSubmit,
}: {
  appeal: Appeal | null;
  staff: UserSummary[];
  onClose: () => void;
  onSubmit: (values: AppealFormValues) => Promise<void>;
}) {
  const { user } = useAuth();
  const canAssign = user ? canEditAssignments(user) : false;

  const [values, setValues] = useState<AppealFormValues>({
    date: toDateInputValue(appeal?.date),
    phone: appeal?.phone ?? "",
    intake: appeal?.intake ?? "PHONE",
    clientData: appeal?.clientData ?? "",
    status: appeal?.status ?? "NEW",
    description: appeal?.description ?? "",
    govAssigneeId: assigneeToOption(appeal?.govAssignee?.id),
    cbAssigneeId: assigneeToOption(appeal?.cbAssignee?.id),
    fsbAssigneeId: assigneeToOption(appeal?.fsbAssignee?.id),
    closerAssigneeId: assigneeToOption(appeal?.closerAssignee?.id),
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

  function renderAssigneeSelect(
    label: string,
    field: "govAssigneeId" | "cbAssigneeId" | "fsbAssigneeId" | "closerAssigneeId"
  ) {
    return (
      <label>
        {label}
        <select
          value={values[field] ?? ""}
          disabled={!canAssign}
          onChange={(e) =>
            setValues((v) => ({ ...v, [field]: e.target.value ? Number(e.target.value) : null }))
          }
        >
          <option value="">— не назначено —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{appeal ? "Редактировать обращение" : "Новое обращение"}</h2>

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
            Прием
            <select
              value={values.intake}
              onChange={(e) => setValues((v) => ({ ...v, intake: e.target.value as IntakeChannel }))}
            >
              {Object.entries(INTAKE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Статус
            <select
              value={values.status}
              onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as AppealStatus }))}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Данные клиента
            <textarea
              value={values.clientData}
              onChange={(e) => setValues((v) => ({ ...v, clientData: e.target.value }))}
              rows={2}
            />
          </label>

          {renderAssigneeSelect("Госы", "govAssigneeId")}
          {renderAssigneeSelect("ЦБ", "cbAssigneeId")}
          {renderAssigneeSelect("ФСБ", "fsbAssigneeId")}
          {renderAssigneeSelect("Закрыв", "closerAssigneeId")}

          <label className="span-2">
            Описание
            <textarea
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              rows={3}
            />
          </label>
        </div>

        {!canAssign && (
          <p className="hint-text">
            Поля «Госы / ЦБ / ФСБ / Закрыв» назначает менеджер или администратор.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
