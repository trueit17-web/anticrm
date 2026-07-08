import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { OPTION_FIELD_LABELS, OptionField, SelectOption } from "../types";

const FIELDS: OptionField[] = ["GOV", "CB", "FSB", "CLOSER", "STATUS"];

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

  const showColor = field === "STATUS";

  return (
    <section className="stats-section">
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
                  <input
                    type="color"
                    title="Цвет строки для этого статуса"
                    value={o.color ?? "#ffffff"}
                    onChange={(e) => handleColorChange(o.id, e.target.value)}
                  />
                )}
                <button className="link-button" onClick={() => handleDelete(o.id)}>
                  Удалить
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

export function AdminPage() {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Админка</h1>
          <p className="muted">Справочники для полей Госы / ЦБ / ФСБ / Закрыв / Статус</p>
        </div>
        <div className="header-actions">
          <Link to="/">← К обращениям</Link>
        </div>
      </header>

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading &&
        !error &&
        FIELDS.map((field) => (
          <OptionFieldEditor
            key={field}
            field={field}
            options={options.filter((o) => o.field === field)}
            onChange={load}
          />
        ))}
    </div>
  );
}
