import { KeyboardEvent, PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { Appeal } from "../types";
import { AuthUser } from "../types";
import { canEditAppeal, canEditAssignments } from "../lib/permissions";
import { detectMobileOperator } from "../lib/mobileOperator";
import { formatMoney } from "../lib/money";
import { useEdgeAutoScroll } from "../hooks/useEdgeAutoScroll";
import { IconCheck, IconEdit, IconTrash, IconX } from "./icons";
import { EmployeeNameButton } from "./EmployeeCard";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Header labels + default widths for the main trubki table, kept in one place
// so the <colgroup>, the header row, and the persisted per-user widths all
// stay in sync. The trailing empty column is the row-actions column.
const COLUMNS: { label: string; className?: string }[] = [
  { label: "№", className: "col-num" },
  { label: "📅 Дата", className: "col-center" },
  { label: "📞 Телефон" },
  { label: "📠 ТФ", className: "col-center" },
  { label: "🧾 Данные клиента" },
  { label: "💰 Деп." },
  { label: "💬 СМС", className: "col-center" },
  { label: "Прием", className: "col-center" },
  { label: "🏛️ Госы", className: "col-center" },
  { label: "🚦 Статус", className: "col-center" },
  { label: "📝 Описание" },
  { label: "🏦 ЦБ", className: "col-center" },
  { label: "🛡️ ФСБ", className: "col-center" },
  { label: "🔒 Закрыв", className: "col-center" },
  { label: "" },
];
const DEFAULT_WIDTHS = [36, 110, 112, 90, 178, 90, 90, 60, 110, 130, 180, 110, 110, 110, 64];
const MIN_COL_WIDTH = 40;
// Bumped if COLUMNS ever changes shape, so an old saved layout with the wrong
// number of columns is discarded rather than misapplied.
const COL_WIDTHS_KEY = (userId: number) => `crm_appeal_col_widths_v1_${userId}`;

function loadColWidths(userId: number): number[] {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_KEY(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === DEFAULT_WIDTHS.length &&
        parsed.every((n) => typeof n === "number" && n > 0)
      ) {
        return parsed;
      }
    }
  } catch {
    // ignore malformed/blocked storage — fall back to defaults
  }
  return [...DEFAULT_WIDTHS];
}

type TagField = "gov" | "cb" | "fsb" | "closer" | "tf";

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
        <td className="muted col-center">—</td>
        <td>
          <input
            placeholder="Данные клиента"
            value={values.clientData}
            onChange={(e) => setValues((v) => ({ ...v, clientData: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </td>
        <td>
          <span className="money-field">
            <input
              placeholder="Деп."
              value={values.dep}
              onChange={(e) => setValues((v) => ({ ...v, dep: e.target.value }))}
              onKeyDown={handleKeyDown}
            />
            <span className="money-suffix">₽</span>
          </span>
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
          <div className="inline-row-actions">
            <button
              className="btn-save btn-icon-only"
              onClick={handleSubmit}
              disabled={submitting || !values.phone.trim()}
              title="Сохранить"
              aria-label="Сохранить"
            >
              <IconCheck width={16} height={16} />
            </button>
            <button
              className="btn-cancel btn-icon-only"
              onClick={onCancel}
              disabled={submitting}
              title="Отмена"
              aria-label="Отмена"
            >
              <IconX width={16} height={16} />
            </button>
          </div>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={15} className="error-text">
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
  tfOptions,
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
  tfOptions: string[];
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
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeAutoScroll(scrollRef);

  // Per-user resizable column widths, remembered across logins (localStorage,
  // keyed by user id so shared browsers don't cross over).
  const [colWidths, setColWidths] = useState<number[]>(() => loadColWidths(currentUser.id));
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  function startResize(index: number, e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[index];
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(MIN_COL_WIDTH, Math.round(startW + (ev.clientX - startX)));
      setColWidths((prev) => {
        if (prev[index] === next) return prev;
        const copy = [...prev];
        copy[index] = next;
        return copy;
      });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.classList.remove("col-resizing");
      setColWidths((prev) => {
        try {
          localStorage.setItem(COL_WIDTHS_KEY(currentUser.id), JSON.stringify(prev));
        } catch {
          // ignore storage failures (private mode / quota)
        }
        return prev;
      });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.classList.add("col-resizing");
  }

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
    <div className="table-scroll" ref={scrollRef}>
      <table className="appeals-table" style={{ width: tableWidth }}>
        <colgroup>
          {colWidths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((c, i) => (
              <th key={i} className={c.className}>
                {c.label}
                {i < COLUMNS.length - 1 && (
                  <span
                    className="col-resizer"
                    onPointerDown={(e) => startResize(i, e)}
                    title="Потяните, чтобы изменить ширину колонки"
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {appeals.length === 0 && !creating && (
            <tr>
              <td colSpan={15} className="empty-state">
                Трубок пока нет.
              </td>
            </tr>
          )}
          {appeals.map((appeal, index) => {
            const editable = canEditAppeal(currentUser, appeal);
            const smsSent = !!appeal.smsSentBy;
            const rowColor = statusColors[appeal.status];
            return (
              <tr
                key={appeal.id}
                className={rowColor ? "status-colored-row" : undefined}
                style={rowColor ? { "--status-row-color": rowColor } as React.CSSProperties : undefined}
              >
                <td className="muted col-num">{index + 1}</td>
                <td className="col-center date-cell">
                  <EmployeeNameButton id={appeal.operator.id} fullName={appeal.operator.fullName} />
                  {", "}
                  {formatTime(appeal.createdAt)}
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
                <td className="col-center">{renderTagSelect(appeal, "tf", tfOptions)}</td>
                <td className="wrap-cell" title={appeal.clientData ?? undefined}>
                  {appeal.clientData || "—"}
                </td>
                <td className="wrap-cell" title={appeal.dep ?? undefined}>
                  {formatMoney(appeal.dep)}
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
                <td className="col-center row-actions">
                  {editable && (
                    <button className="icon-btn" title="Изменить" aria-label="Изменить" onClick={() => onEdit(appeal)}>
                      <IconEdit width={14} height={14} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="delete-x"
                      title="Удалить трубку"
                      aria-label="Удалить трубку"
                      onClick={() => onDelete(appeal)}
                    >
                      <IconTrash width={11} height={11} />
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
