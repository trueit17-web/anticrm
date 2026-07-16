import { KeyboardEvent, useState } from "react";
import { Appeal } from "../types";
import { AuthUser } from "../types";
import { canEditAppeal, canEditAssignments } from "../lib/permissions";
import { detectMobileOperator } from "../lib/mobileOperator";
import { IconEdit, IconTrash } from "./icons";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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
  rowNumber,
  initialDate,
  defaultStatus,
  onCancel,
  onSubmit,
}: {
  rowNumber: number;
  initialDate: string;
  defaultStatus: string;
  onCancel: () => void;
  onSubmit: (values: NewAppealValues) => Promise<void>;
}) {
  const [values, setValues] = useState<NewAppealValues>({
    date: initialDate,
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
        <td className="muted col-num">{rowNumber}</td>
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
        <td colSpan={2} className="muted col-center">
          зададутся после создания
        </td>
        <td className="muted col-center">—</td>
        <td className="muted col-center">{defaultStatus}</td>
        <td>
          <input
            placeholder="Описание"
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </td>
        <td colSpan={3} className="muted col-center">
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
          <td colSpan={14} className="error-text">
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
  onDelete,
  govOptions,
  cbOptions,
  fsbOptions,
  closerOptions,
  statusOptions,
  statusColors,
  defaultStatus,
  listDate,
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
  // Only passed for roles allowed to delete straight from this table
  // (currently SUPERADMIN, so they can clean up any date's trubki).
  onDelete?: (appeal: Appeal) => void;
  govOptions: string[];
  cbOptions: string[];
  fsbOptions: string[];
  closerOptions: string[];
  statusOptions: string[];
  statusColors: Record<string, string>;
  defaultStatus: string;
  // Date currently being viewed (YYYY-MM-DD) — the create row defaults to
  // this instead of always today, so creating while browsing history (as
  // SUPERADMIN) doesn't silently backdate to today.
  listDate: string;
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
          <col style={{ width: 36 }} />
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
            <th className="col-num">🔢 №</th>
            <th className="col-center">📅 Дата</th>
            <th>📞 Телефон</th>
            <th>🧾 Данные клиента</th>
            <th>💰 Деп.</th>
            <th className="col-center">💬 СМС</th>
            <th className="col-center">📥 Прием</th>
            <th className="col-center">🏛️ Госы</th>
            <th className="col-center">🚦 Статус</th>
            <th>📝 Описание</th>
            <th className="col-center">🏦 ЦБ</th>
            <th className="col-center">🛡️ ФСБ</th>
            <th className="col-center">🔒 Закрыв</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {appeals.length === 0 && !creating && (
            <tr>
              <td colSpan={14} className="empty-state">
                Трубок пока нет.
              </td>
            </tr>
          )}
          {appeals.map((appeal, index) => {
            const editable = canEditAppeal(currentUser, appeal);
            const smsSent = !!appeal.smsSentBy;
            const rowColor = statusColors[appeal.status];
            return (
              <tr key={appeal.id} style={rowColor ? { backgroundColor: rowColor } : undefined}>
                <td className="muted col-num">{index + 1}</td>
                <td className="col-center">
                  {appeal.operator.fullName}, {formatTime(appeal.createdAt)}
                  {appeal.reportedTime && (
                    <>
                      <br />
                      <span className="muted">код: {appeal.reportedTime}</span>
                    </>
                  )}
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
                <td className={`col-center${smsSent ? " cell-sms-sent" : ""}`}>
                  {smsSent ? (
                    <button
                      type="button"
                      className="sms-time"
                      title="СМС отправлено — нажмите, чтобы снять отметку"
                      onClick={() => onToggleSms(appeal, false)}
                    >
                      {formatTime(appeal.smsSentAt!)}
                    </button>
                  ) : (
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={(e) => onToggleSms(appeal, e.target.checked)}
                    />
                  )}
                </td>
                <td className={`col-center${appeal.intake ? " cell-intake-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={appeal.intake}
                    onChange={(e) => onToggleIntake(appeal, e.target.checked)}
                  />
                </td>
                <td className="col-center">{renderTagSelect(appeal, "gov", govOptions)}</td>
                <td className="col-center">
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
                <td className="col-center">{renderTagSelect(appeal, "cb", cbOptions)}</td>
                <td className="col-center">{renderTagSelect(appeal, "fsb", fsbOptions)}</td>
                <td className="col-center">{renderTagSelect(appeal, "closer", closerOptions)}</td>
                <td className="col-center">
                  {editable && (
                    <button className="icon-btn" title="Изменить" aria-label="Изменить" onClick={() => onEdit(appeal)}>
                      <IconEdit width={16} height={16} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="delete-x"
                      title="Удалить трубку"
                      aria-label="Удалить трубку"
                      onClick={() => onDelete(appeal)}
                    >
                      <IconTrash width={13} height={13} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {creating && (
            <NewAppealRow
              rowNumber={appeals.length + 1}
              initialDate={listDate}
              defaultStatus={defaultStatus}
              onCancel={onCancelCreate}
              onSubmit={onSubmitCreate}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}
