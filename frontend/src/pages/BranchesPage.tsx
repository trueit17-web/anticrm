import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Branch } from "../types";
import { BranchSwitcher } from "../components/BranchSwitcher";

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <Link to="/">← К трубкам</Link>
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
          {branches.map((b) => (
            <li key={b.id}>
              <span>{b.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
