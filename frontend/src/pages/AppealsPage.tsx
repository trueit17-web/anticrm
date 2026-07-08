import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import { Appeal, ROLE_LABELS, UserSummary } from "../types";
import { AppealsTable } from "../components/AppealsTable";
import { AppealFormModal, AppealFormValues } from "../components/AppealFormModal";
import { isManagerOrAdmin } from "../lib/permissions";
import { Link } from "react-router-dom";

export function AppealsPage() {
  const { user, logout } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [staff, setStaff] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appeal | null | "new">(null);

  async function loadAppeals() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ appeals: Appeal[] }>("/appeals");
      setAppeals(res.appeals);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить обращения");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAppeals();
    if (user && isManagerOrAdmin(user)) {
      api
        .get<{ users: UserSummary[] }>("/users")
        // Admins aren't valid Госы/ЦБ/ФСБ/Закрыв assignees — only staff who
        // actually work appeals should show up in that dropdown.
        .then((res) => setStaff(res.users.filter((u) => u.role !== "ADMIN")))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  async function handleCreate(values: AppealFormValues) {
    await api.post("/appeals", values);
    await loadAppeals();
  }

  async function handleUpdate(id: number, values: AppealFormValues) {
    await api.patch(`/appeals/${id}`, values);
    await loadAppeals();
  }

  async function handleToggleSms(appeal: Appeal, sms: boolean) {
    // Optimistic update so the checkbox doesn't feel laggy; reconciled on reload.
    setAppeals((prev) =>
      prev.map((a) =>
        a.id === appeal.id
          ? { ...a, smsSentBy: sms ? { id: user!.id, fullName: user!.fullName } : null, smsSentAt: sms ? new Date().toISOString() : null }
          : a
      )
    );
    try {
      await api.patch(`/appeals/${appeal.id}/sms`, { sms });
    } finally {
      await loadAppeals();
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Обращения</h1>
          <p className="muted">
            {user.fullName} · {ROLE_LABELS[user.role]}
          </p>
        </div>
        <div className="header-actions">
          <Link to="/stats">Статистика</Link>
          {user.role === "ADMIN" && <Link to="/users">Пользователи</Link>}
          <button onClick={() => setEditing("new")}>+ Новое обращение</button>
          <button className="secondary" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <AppealsTable
          appeals={appeals}
          currentUser={user}
          onEdit={setEditing}
          onToggleSms={handleToggleSms}
        />
      )}

      {editing && (
        <AppealFormModal
          appeal={editing === "new" ? null : editing}
          staff={staff}
          onClose={() => setEditing(null)}
          onSubmit={(values) =>
            editing === "new" ? handleCreate(values) : handleUpdate(editing.id, values)
          }
        />
      )}
    </div>
  );
}
