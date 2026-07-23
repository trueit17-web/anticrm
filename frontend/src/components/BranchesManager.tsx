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
  // Write-only: the server never sends the actual key back, so this always
  // starts empty. Left empty on save, the existing key (if any) is
  // untouched — only a non-empty value or the "Удалить ключ" checkbox
  // change it.
  const [dadataApiKey, setDadataApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: { name: string; dadataApiKey?: string | null } = { name };
      if (clearApiKey) payload.dadataApiKey = null;
      else if (dadataApiKey.trim()) payload.dadataApiKey = dadataApiKey.trim();
      await api.patch(`/branches/${branch.id}`, payload);
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
          placeholder={
            branch.hasDadataApiKey ? "Ключ задан — оставьте пустым, чтобы не менять" : "DaData API-ключ (необязательно)"
          }
          disabled={clearApiKey}
        />
        {branch.hasDadataApiKey && (
          <label className="toggle-inline" title="Убрать ключ этого филиала — будет использован общий ключ сервера">
            <input type="checkbox" checked={clearApiKey} onChange={(e) => setClearApiKey(e.target.checked)} />
            Удалить ключ
          </label>
        )}
        <button type="submit" disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Отмена
        </button>
      </form>
      <p className="muted">
        {branch.hasDadataApiKey ? "Ключ задан. " : "Ключ не задан — используется общий ключ сервера, если он есть. "}
        Ключ для поиска организации по «ИНН ЮЛ» в карточке звонка. Бесплатный ключ —{" "}
        <a href="https://dadata.ru/api/find-party/" target="_blank" rel="noreferrer">
          dadata.ru/api/find-party
        </a>
        .
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
