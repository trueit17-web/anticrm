import { KeyboardEvent, useState } from "react";
import { Appeal } from "../types";
import { AuthUser } from "../types";
import { canEditAppeal, canEditAssignments } from "../lib/permissions";
import { detectMobileOperator } from "../lib/mobileOperator";

function formatDateTime(dateIso: string, timeSourceIso: string): string {
  const datePart = new Date(dateIso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const timePart = new Date(timeSourceIso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

type TagField = "gov" | "cb" | "fsb" | "closer";

export interface NewAppealValues {
  date: string;
  phone: string;
  clientData: string;
  dep: string;
  description: string;
}

function NewAppealRow({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (values: NewAppealValues) => Promise<void>;
}) {
  const [values, setValues] = useState<NewAppealValues>({
    date: todayInputValue(),
    phone: "",
    clientData: "",
    dep: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!values.phone.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <>
      <tr className="new-appeal-row">
        <td>
          <input
            type="date"
            value={values.date}
            onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </td>
        <td>
          <input
            placeholder="Телефон"
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </td>
        <td>
          <input
            placeholder="Данные клиента"
            value={values.clientData}
            onChange={(e) => setValues((v) => ({ ...v, clientData: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </td>
        <td>
          <input
            placeholder="Деп."
            value={values.dep}
            onChange={(e) => setValues((v) => ({ ...v, dep: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </td>
        <td colSpan={2} className="muted">
          зададутся после создания
        </td>
        <td className="muted">—</td>
        <td className="muted">Новое</td>
        <td>
          <input
            placeholder="Описание"
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </td>
        <td colSpan={3} className="muted">
          —
        </td>
        <td>
          <button onClick={handleSubmit} disabled={submitting || !values.phone.trim()}>
            {submitting ? "..." : "Сохранить"}
          </button>{" "}
          <button className="secondary" onClick={onCancel} disabled={submitting}>
            Отмена
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={13} className="error-text">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

export function AppealsTable({
  appeals,
  currentUser,
  onEdit,
  onToggleSms,
  onToggleIntake,
  onInlineTagChange,
  onInlineStatusChange,
  govOptions,
  cbOptions,
  fsbOptions,
  closerOptions,
  statusOptions,
  statusColors,
  creating,
  onCancelCreate,
  onSubmitCreate,
}: {
  appeals: Appeal[];
  currentUser: AuthUser;
  onEdit: (appeal: Appeal) => void;
  onToggleSms: (appeal: Appeal, sms: boolean) => void;
  onToggleIntake: (appeal: Appeal, intake: boolean) => void;
  onInlineTagChange: (appeal: Appeal, field: TagField, value: string | null) => void;
  onInlineStatusChange: (appeal: Appeal, value: string) => void;
  govOptions: string[];
  cbOptions: string[];
  fsbOptions: string[];
  closerOptions: string[];
  statusOptions: string[];
  statusColors: Record<string, string>;
  creating: boolean;
  onCancelCreate: () => void;
  onSubmitCreate: (values: NewAppealValues) => Promise<void>;
}) {
  const canAssign = canEditAssignments(currentUser);

  function renderTagSelect(appeal: Appeal, field: TagField, options: string[]) {
    const value = appeal[field] ?? "";
    if (!canAssign) {
      return <span>{value || "—"}</span>;
    }
    return (
      <select value={value} onChange={(e) => onInlineTagChange(appeal, field, e.target.value || null)}>
        <option value=""></option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="table-scroll">
      <table className="appeals-table">
        <colgroup>
          <col style={{ width: 110 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 160 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 60 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Телефон</th>
            <th>Данные клиента</th>
            <th>Деп.</th>
            <th>СМС</th>
            <th>Прием</th>
            <th>Госы</th>
            <th>Статус</th>
            <th>Описание</th>
            <th>ЦБ</th>
            <th>ФСБ</th>
            <th>Закрыв</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {appeals.length === 0 && !creating && (
            <tr>
              <td colSpan={13} className="empty-state">
                Трубок пока нет.
              </td>
            </tr>
          )}
          {appeals.map((appeal) => {
            const editable = canEditAppeal(currentUser, appeal);
            const smsSent = !!appeal.smsSentBy;
            const rowColor = statusColors[appeal.status];
            return (
              <tr key={appeal.id} style={rowColor ? { backgroundColor: rowColor } : undefined}>
                <td>
                  {appeal.operator.fullName}
                  <br />
                  {formatDateTime(appeal.date, appeal.createdAt)}
                </td>
                <td className={smsSent ? "cell-sms-sent" : undefined}>
                  {appeal.phone}
                  <br />
                  <span className="muted">{detectMobileOperator(appeal.phone)}</span>
                </td>
                <td className="wrap-cell" title={appeal.clientData ?? undefined}>
                  {appeal.clientData || "—"}
                </td>
                <td className="wrap-cell" title={appeal.dep ?? undefined}>
                  {appeal.dep || "—"}
                </td>
                <td>
                  <label className="sms-cell">
                    <input
                      type="checkbox"
                      checked={smsSent}
                      onChange={(e) => onToggleSms(appeal, e.target.checked)}
                    />
                    {appeal.smsSentBy && (
                      <span className="muted">{formatTime(appeal.smsSentAt!)}</span>
                    )}
                  </label>
                </td>
                <td className={appeal.intake ? "cell-intake-active" : undefined}>
                  <input
                    type="checkbox"
                    checked={appeal.intake}
                    onChange={(e) => onToggleIntake(appeal, e.target.checked)}
                  />
                </td>
                <td>{renderTagSelect(appeal, "gov", govOptions)}</td>
                <td>
                  {canAssign ? (
                    <select value={appeal.status} onChange={(e) => onInlineStatusChange(appeal, e.target.value)}>
                      {statusOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="status-pill">{appeal.status}</span>
                  )}
                </td>
                <td className="wrap-cell" title={appeal.description ?? undefined}>
                  {appeal.description || "—"}
                </td>
                <td>{renderTagSelect(appeal, "cb", cbOptions)}</td>
                <td>{renderTagSelect(appeal, "fsb", fsbOptions)}</td>
                <td>{renderTagSelect(appeal, "closer", closerOptions)}</td>
                <td>
                  {editable && (
                    <button className="link-button" onClick={() => onEdit(appeal)}>
                      Изменить
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {creating && <NewAppealRow onCancel={onCancelCreate} onSubmit={onSubmitCreate} />}
        </tbody>
      </table>
    </div>
  );
}
