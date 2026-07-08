import { Appeal } from "../types";
import { AuthUser } from "../types";
import { canEditAppeal, canEditAssignments } from "../lib/permissions";
import { detectMobileOperator } from "../lib/mobileOperator";

function formatDateTime(dateIso: string, timeSourceIso: string): string {
  const datePart = new Date(dateIso).toLocaleDateString("ru-RU");
  const timePart = new Date(timeSourceIso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

type TagField = "gov" | "cb" | "fsb" | "closer";

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
}) {
  if (appeals.length === 0) {
    return <p className="empty-state">Обращений пока нет.</p>;
  }

  const canAssign = canEditAssignments(currentUser);

  function renderTagSelect(appeal: Appeal, field: TagField, options: string[]) {
    const value = appeal[field] ?? "";
    if (!canAssign) {
      return <span>{value || "—"}</span>;
    }
    return (
      <select value={value} onChange={(e) => onInlineTagChange(appeal, field, e.target.value || null)}>
        <option value="">— не выбрано —</option>
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
        <thead>
          <tr>
            <th>Дата</th>
            <th>Телефон</th>
            <th>СМС</th>
            <th>Прием</th>
            <th>Данные клиента</th>
            <th>Госы</th>
            <th>ЦБ</th>
            <th>ФСБ</th>
            <th>Закрыв</th>
            <th>Статус</th>
            <th>Описание</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {appeals.map((appeal) => {
            const editable = canEditAppeal(currentUser, appeal);
            const smsSent = !!appeal.smsSentBy;
            return (
              <tr key={appeal.id}>
                <td>{formatDateTime(appeal.date, appeal.createdAt)}</td>
                <td className={smsSent ? "cell-sms-sent" : undefined}>
                  {appeal.phone}
                  <br />
                  <span className="muted">{detectMobileOperator(appeal.phone)}</span>
                </td>
                <td>
                  <label className="sms-cell">
                    <input
                      type="checkbox"
                      checked={smsSent}
                      onChange={(e) => onToggleSms(appeal, e.target.checked)}
                    />
                    {appeal.smsSentBy && (
                      <span className="muted">
                        {appeal.smsSentBy.fullName}
                        <br />
                        {formatTime(appeal.smsSentAt!)}
                      </span>
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
                <td className="wrap-cell">{appeal.clientData || "—"}</td>
                <td>{renderTagSelect(appeal, "gov", govOptions)}</td>
                <td>{renderTagSelect(appeal, "cb", cbOptions)}</td>
                <td>{renderTagSelect(appeal, "fsb", fsbOptions)}</td>
                <td>{renderTagSelect(appeal, "closer", closerOptions)}</td>
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
                <td className="wrap-cell">{appeal.description || "—"}</td>
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
        </tbody>
      </table>
    </div>
  );
}
