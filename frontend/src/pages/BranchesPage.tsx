import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Branch } from "../types";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconBack, IconEdit } from "../components/icons";

function BranchRow({
  branch,
  onCancel,
  onSaved,
}: {
  branch: Branch;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(branch.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/branches/${branch.id}`, { name });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li>
      <form className="inline-form" onSubmit={handleSave}>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Отмена
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </li>
  );
}

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<{ branches: Branch[] }>("/branches")
      .then((res) => setBranches(res.branches))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить филиалы"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await api.post("/branches", { name });
      setName("");
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать филиал");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Филиалы</h1>
          <p className="muted">
            Создайте филиал, затем зарегистрируйте для него сотрудников на странице{" "}
            <Link to="/users">Пользователи</Link>, выбрав этот филиал переключателем сверху.
          </p>
        </div>
        <div className="header-actions">
          <BranchSwitcher />
          <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
            <IconBack />
          </Link>
        </div>
      </header>

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          placeholder="Название филиала"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" disabled={creating}>
          {creating ? "Создание..." : "Добавить филиал"}
        </button>
      </form>
      {formError && <p className="error-text">{formError}</p>}

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <ul className="admin-option-list">
          {branches.map((b) =>
            editingId === b.id ? (
              <BranchRow
                key={b.id}
                branch={b}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
              />
            ) : (
              <li key={b.id}>
                <span>{b.name}</span>
                <button
                  className="icon-btn"
                  title="Редактировать"
                  aria-label="Редактировать"
                  onClick={() => setEditingId(b.id)}
                >
                  <IconEdit width={16} height={16} />
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
