import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ROLE_LABELS, Role, UserSummary } from "../types";

export function UsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ users: UserSummary[] }>("/users");
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить пользователей");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await api.post("/users", { username, password, fullName, role });
      setUsername("");
      setPassword("");
      setFullName("");
      setRole("USER");
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать пользователя");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: UserSummary) {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await loadUsers();
  }

  async function changeRole(u: UserSummary, newRole: Role) {
    await api.patch(`/users/${u.id}`, { role: newRole });
    await loadUsers();
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Пользователи</h1>
        </div>
        <div className="header-actions">
          <Link to="/">← К обращениям</Link>
        </div>
      </header>

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          placeholder="Логин"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <input
          placeholder="Имя сотрудника"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={creating}>
          {creating ? "Создание..." : "Добавить сотрудника"}
        </button>
      </form>
      {formError && <p className="error-text">{formError}</p>}

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <table className="appeals-table">
          <thead>
            <tr>
              <th>Логин</th>
              <th>Имя</th>
              <th>Роль</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.fullName}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)}>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{u.active ? "Активен" : "Отключён"}</td>
                <td>
                  <button className="link-button" onClick={() => toggleActive(u)}>
                    {u.active ? "Отключить" : "Включить"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
