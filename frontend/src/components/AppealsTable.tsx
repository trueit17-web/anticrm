import { Appeal, INTAKE_LABELS, STATUS_LABELS } from "../types";
import { AuthUser } from "../types";
import { canEditAppeal } from "../lib/permissions";
import { detectMobileOperator } from "../lib/mobileOperator";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppealsTable({
  appeals,
  currentUser,
  onEdit,
  onToggleSms,
}: {
  appeals: Appeal[];
  currentUser: AuthUser;
  onEdit: (appeal: Appeal) => void;
  onToggleSms: (appeal: Appeal, sms: boolean) => void;
}) {
  if (appeals.length === 0) {
    return <p className="empty-state">Обращений пока нет.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="appeals-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Оператор + время</th>
            <th>Телефон</th>
            <th>Опер. (моб.)</th>
            <th>Прием</th>
            <th>Данные клиента</th>
            <th>Госы</th>
            <th>ЦБ</th>
            <th>ФСБ</th>
            <th>Закрыв</th>
            <th>Статус</th>
            <th>СМС</th>
            <th>Описание</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {appeals.map((appeal) => {
            const editable = canEditAppeal(currentUser, appeal);
            return (
              <tr key={appeal.id}>
                <td>{formatDate(appeal.date)}</td>
                <td>
                  {appeal.operator.fullName}
                  <br />
                  <span className="muted">{formatDateTime(appeal.createdAt)}</span>
                </td>
                <td>{appeal.phone}</td>
                <td>{detectMobileOperator(appeal.phone)}</td>
                <td>{INTAKE_LABELS[appeal.intake]}</td>
                <td className="wrap-cell">{appeal.clientData || "—"}</td>
                <td>{appeal.govAssignee?.fullName ?? "—"}</td>
                <td>{appeal.cbAssignee?.fullName ?? "—"}</td>
                <td>{appeal.fsbAssignee?.fullName ?? "—"}</td>
                <td>{appeal.closerAssignee?.fullName ?? "—"}</td>
                <td>
                  <span className={`status-pill status-${appeal.status.toLowerCase()}`}>
                    {STATUS_LABELS[appeal.status]}
                  </span>
                </td>
                <td>
                  <label className="sms-cell">
                    <input
                      type="checkbox"
                      checked={!!appeal.smsSentBy}
                      onChange={(e) => onToggleSms(appeal, e.target.checked)}
                    />
                    {appeal.smsSentBy && (
                      <span className="muted">
                        {appeal.smsSentBy.fullName}
                        <br />
                        {formatDateTime(appeal.smsSentAt!)}
                      </span>
                    )}
                  </label>
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
