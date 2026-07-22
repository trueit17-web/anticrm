import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Branch } from "../types";
import { IconEdit } from "./icons";

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
  const [dadataApiKey, setDadataApiKey] = useState(branch.dadataApiKey ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/branches/${branch.id}`, { name, dadataApiKey: dadataApiKey.trim() || null });
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
        <input
          value={dadataApiKey}
          onChange={(e) => setDadataApiKey(e.target.value)}
          placeholder="DaData API-ключ (необязательно)"
        />
        <button type="submit" disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Отмена
        </button>
      </form>
      <p className="muted">
        Ключ для поиска организации по «ИНН ЮЛ» в карточке звонка. Бесплатный ключ —{" "}
        <a href="https://dadata.ru/api/find-party/" target="_blank" rel="noreferrer">
          dadata.ru/api/find-party
        </a>
        . Пусто — используется общий ключ сервера, если он задан.
      </p>
      {error && <p className="error-text">{error}</p>}
    </li>
  );
}

export function BranchesManager() {
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

  async function handleToggleContacts(branch: Branch) {
    setBranches((prev) =>
      prev.map((b) => (b.id === branch.id ? { ...b, contactsEnabled: !b.contactsEnabled } : b))
    );
    try {
      await api.patch(`/branches/${branch.id}`, { contactsEnabled: !branch.contactsEnabled });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
      load();
    }
  }

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
    <div>
      <p className="muted">
        Создайте филиал, затем зарегистрируйте для него сотрудников на вкладке «Пользователи»,
        выбрав этот филиал переключателем слева от заголовка страницы.
      </p>

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
                <span className="admin-option-actions">
                  <label className="toggle-inline" title="Загрузка баз и очередь звонков для этого филиала">
                    <input
                      type="checkbox"
                      checked={b.contactsEnabled}
                      onChange={() => handleToggleContacts(b)}
                    />
                    Прозвон
                  </label>
                  <button
                    className="icon-btn"
                    title="Редактировать"
                    aria-label="Редактировать"
                    onClick={() => setEditingId(b.id)}
                  >
                    <IconEdit width={16} height={16} />
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
