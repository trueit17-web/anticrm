import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError, getSelectedDate, setSelectedDate } from "../api/client";
import { Appeal, OPTION_FIELD_LABELS, OptionField, SelectOption } from "../types";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconBack, IconTrash } from "../components/icons";
import { formatRuDate, todayInputValue } from "../lib/dateUtils";

const FIELDS: OptionField[] = ["TF", "GOV", "CB", "FSB", "CLOSER", "STATUS"];

// Saturated row-highlight colors that still keep dark table text readable.
const COLOR_PALETTE = [
  "#ffffff",
  "#fecaca",
  "#fed7aa",
  "#fef08a",
  "#bbf7d0",
  "#99f6e4",
  "#bfdbfe",
  "#c7d2fe",
  "#ddd6fe",
  "#fbcfe8",
  "#d1d5db",
];

const LEGACY_COLORS: Record<string, string> = {
  "#fee2e2": "#fecaca",
  "#ffedd5": "#fed7aa",
  "#fef9c3": "#fef08a",
  "#dcfce7": "#bbf7d0",
  "#ccfbf1": "#99f6e4",
  "#dbeafe": "#bfdbfe",
  "#e0e7ff": "#c7d2fe",
  "#ede9fe": "#ddd6fe",
  "#fce7f3": "#fbcfe8",
  "#e5e7eb": "#d1d5db",
};

function OptionFieldEditor({
  field,
  options,
  onChange,
}: {
  field: OptionField;
  options: SelectOption[];
  onChange: () => void;
}) {
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newValue.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/select-options", { field, value: newValue.trim() });
      setNewValue("");
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    await api.delete(`/select-options/${id}`);
    onChange();
  }

  async function handleColorChange(id: number, color: string) {
    await api.patch(`/select-options/${id}`, { color });
    onChange();
  }

  async function handleSetDefault(id: number) {
    await api.patch(`/select-options/${id}`, { isDefault: true });
    onChange();
  }

  const showColor = field === "STATUS";
  const showDefault = field === "STATUS";

  return (
    <section className="admin-field-card">
      <h2>{OPTION_FIELD_LABELS[field]}</h2>
      {options.length === 0 ? (
        <p className="muted">Список пуст.</p>
      ) : (
        <ul className="admin-option-list">
          {options.map((o) => (
            <li key={o.id}>
              <span>{o.value}</span>
              <span className="admin-option-actions">
                {showColor && (
                  <span className="color-palette">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`color-swatch${(LEGACY_COLORS[o.color ?? ""] ?? o.color ?? "#ffffff") === c ? " color-swatch-active" : ""}`}
                        style={{ backgroundColor: c }}
                        title={c}
                        onClick={() => handleColorChange(o.id, c)}
                      />
                    ))}
                  </span>
                )}
                {showDefault &&
                  (o.isDefault ? (
                    <span className="default-badge" title="Статус новых трубок по умолчанию">
                      ★ По умолчанию
                    </span>
                  ) : (
                    <button className="link-button" onClick={() => handleSetDefault(o.id)}>
                      Сделать по умолчанию
                    </button>
                  ))}
                <button className="icon-btn" title="Удалить" aria-label="Удалить" onClick={() => handleDelete(o.id)}>
                  <IconTrash width={15} height={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={handleAdd}>
        <input
          placeholder="Новое значение"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          Добавить
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function formatAppealLine(a: Appeal): string {
  const date = new Date(a.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const parts = [date, a.phone];
  if (a.clientData) parts.push(a.clientData);
  return parts.join(" — ");
}

function AppealsDeleteSection({ date }: { date: string }) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<{ appeals: Appeal[] }>(`/appeals?date=${date}`)
      .then((res) => setAppeals(res.appeals))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [date]);

  async function handleDelete(id: number) {
    setAppeals((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.delete(`/appeals/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
      load();
    }
  }

  return (
    <section className="admin-field-card fit-content">
      <h2>Трубки за {date === todayInputValue() ? "сегодня" : formatRuDate(date)}</h2>
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && appeals.length === 0 && <p className="muted">Трубок пока нет.</p>}
      {!loading && !error && appeals.length > 0 && (
        <ul className="admin-option-list">
          {appeals.map((a) => (
            <li key={a.id}>
              <span>{formatAppealLine(a)}</span>
              <button
                className="delete-x"
                title="Удалить трубку"
                aria-label="Удалить трубку"
                onClick={() => handleDelete(a.id)}
              >
                <IconTrash width={13} height={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type AdminTab = "appeals" | OptionField;

export function AdminPage() {
  const { user } = useAuth();
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("appeals");
  // SUPERADMIN picks which date's trubki to browse here (moved off the main
  // trubki page); everyone else always works off today's.
  const [selectedDate, setSelectedDateState] = useState(() =>
    user?.role === "SUPERADMIN" ? getSelectedDate() ?? todayInputValue() : todayInputValue()
  );

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<{ options: SelectOption[] }>("/select-options")
      .then((res) => setOptions(res.options))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function handleDateChange(date: string) {
    setSelectedDateState(date);
    setSelectedDate(date);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="page-title-row">
            <h1>Админка</h1>
            <BranchSwitcher />
          </div>
          <p className="muted">Справочники для полей ТФ / Госы / ЦБ / ФСБ / Закрыв / Статус</p>
        </div>
        <div className="header-actions">
          {user?.role === "SUPERADMIN" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              title="Показать трубки за дату"
            />
          )}
          <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
            <IconBack />
          </Link>
        </div>
      </header>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab${activeTab === "appeals" ? " admin-tab-active" : ""}`}
          onClick={() => setActiveTab("appeals")}
        >
          Трубки
        </button>
        {FIELDS.map((field) => (
          <button
            key={field}
            type="button"
            className={`admin-tab${activeTab === field ? " admin-tab-active" : ""}`}
            onClick={() => setActiveTab(field)}
          >
            {OPTION_FIELD_LABELS[field]}
          </button>
        ))}
      </div>

      <div className="admin-tab-panel">
        {activeTab === "appeals" ? (
          <AppealsDeleteSection date={selectedDate} />
        ) : (
          <>
            {loading && <p>Загрузка...</p>}
            {error && <p className="error-text">{error}</p>}
            {!loading && !error && (
              <OptionFieldEditor
                field={activeTab}
                options={options.filter((o) => o.field === activeTab)}
                onChange={load}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
